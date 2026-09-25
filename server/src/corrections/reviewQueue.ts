import { HttpError } from "../lib/httpError.js";
import { pool } from "../db/pool.js";
import type { CorrectionStatus, CorrectionType, Direction, Target } from "./recordCorrection.js";

export type ReviewQueueReportStatus = CorrectionStatus;
export type ClaimStatus = CorrectionStatus;

export type ReviewQueueReport = {
  id: string;
  correctionType: CorrectionType;
  target: Target;
  note: string | null;
  status: ReviewQueueReportStatus;
  createdAt: string;
  // Never a real identity. Assigned once per claim over ALL reports (live + rejected), ordered by
  // createdAt, so a pseudonym never shifts after another report in the same claim is rejected.
  reporterLabel: string; // "Reporter A" | "Reporter B" | ... | "Reporter (account deleted)"
  rejectedBy: { email: string } | null; // admin accountability, shown in full — not user health data
  rejectedAt: string | null;
  rejectionReason: string | null;
};

export type ReviewQueueClaim = {
  // Null for a claim built from a barcode-less Path C scan's correction (docs/verdict-engine.md) —
  // see groupIntoClaims below for why every such row is always its own singleton claim.
  barcode: string | null;
  allergen: string | null; // null only for wrong_product
  direction: Direction;
  status: ClaimStatus;
  // DISTINCT reported_by among non-rejected rows, excluding NULL — this is the number that
  // actually drives corroboration (recordCorrection.ts's threshold check is count(DISTINCT
  // reported_by), which SQL excludes NULLs from). NOT the same as communityAdditions.ts's own
  // family-facing reporterCount, which deliberately uses count(*) so a deleted account's report
  // still counts as evidence for families — that's the right call for that display, but wrong here:
  // an admin judging corroboration *strength* needs to know how many live, re-contactable accounts
  // actually back a claim, not how many rows exist.
  liveReporterCount: number;
  // Non-rejected rows where reported_by IS NULL (the reporter's account was later deleted). Shown
  // separately, never folded into liveReporterCount or silently dropped — the report is still valid
  // evidence, it's just not attributable to a specific live account.
  deletedAccountReportCount: number;
  // True when two or more LIVE reporters on this claim (reported_by IS NOT NULL, status !=
  // 'rejected') share a circle (co-manager or accepted follower on the same allergen_profile, on
  // ANY profile — not scoped to the report's own scan). A deleted-account report has no id to check
  // membership against, so it can never trigger this. No identities included; only this boolean
  // ever leaves this module.
  sameCircleWarning: boolean;
  reports: ReviewQueueReport[]; // full list, every status, including deleted-account reports
};

type CorrectionRow = {
  id: string;
  barcode: string | null;
  allergen: string | null;
  direction: Direction;
  correction_type: CorrectionType;
  target: Target;
  note: string | null;
  status: CorrectionStatus;
  created_at: string;
  reported_by: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  rejected_by_email: string | null;
};

/**
 * All corrections, oldest first. No pagination — same "handful of rows for a long time yet"
 * precedent as aiAccuracyReport.ts; this reads the same table. reported_by's own user row is never
 * joined here (no email column fetched for it) — reporter identity never leaves this module, only
 * the pseudonym groupIntoClaims derives from it. rejected_by IS joined, since rejector identity is
 * admin accountability, not user health data (docs/principles.md's new precedent row).
 */
async function fetchCorrectionRows(): Promise<CorrectionRow[]> {
  const { rows } = await pool.query<CorrectionRow>(
    `SELECT
       pc.id, pc.barcode, pc.allergen, pc.direction, pc.correction_type, pc.target, pc.note,
       pc.status, pc.created_at, pc.reported_by, pc.rejected_by, pc.rejected_at,
       pc.rejection_reason, rejector.email AS rejected_by_email
     FROM product_corrections pc
     LEFT JOIN users rejector ON rejector.id = pc.rejected_by
     ORDER BY pc.created_at ASC`,
  );
  return rows;
}

/**
 * user_id -> the set of allergen_profile_id it belongs to, via profile ownership
 * (allergen_profiles.manager_id — the owner, NOT the same thing as profile_managers, which is
 * co-managers only per migration 0004/0006's split), co-manager access (profile_managers), or an
 * *accepted* follow (follow_relationships — a pending or revoked follow doesn't count, since it
 * never granted real circle membership). All three are ways assertCanReadProfile lets someone
 * report a correction in the first place, so all three have to count here, or the most common case
 * — the profile owner themself reporting — would silently never trigger the same-circle warning.
 * Used only to compute sameCircleWarning; the map itself, and the ids it's keyed by, never leave
 * this module.
 */
async function fetchCircleMemberships(userIds: string[]): Promise<Map<string, Set<string>>> {
  const memberships = new Map<string, Set<string>>();
  if (userIds.length === 0) return memberships;

  const { rows } = await pool.query<{ allergen_profile_id: string; user_id: string }>(
    `SELECT id AS allergen_profile_id, manager_id AS user_id FROM allergen_profiles WHERE manager_id = ANY($1)
     UNION
     SELECT allergen_profile_id, user_id FROM profile_managers WHERE user_id = ANY($1)
     UNION
     SELECT allergen_profile_id, follower_id AS user_id FROM follow_relationships
       WHERE follower_id = ANY($1) AND status = 'accepted'`,
    [userIds],
  );
  for (const { allergen_profile_id, user_id } of rows) {
    const set = memberships.get(user_id) ?? new Set<string>();
    set.add(allergen_profile_id);
    memberships.set(user_id, set);
  }
  return memberships;
}

// Spreadsheet-style column naming (A, B, ..., Z, AA, AB, ...) so pseudonym assignment never runs
// out — this app's own scale precedent (aiAccuracyReport.ts: "a handful of rows for a long time
// yet") makes 26+ live reporters on one claim implausible, but there's no reason to let that be a
// silent bug instead of just being correct.
function letterFor(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** True if any two of the given (already deduplicated) live reporter ids share a profile. */
function hasSharedProfile(reporterIds: string[], memberships: Map<string, Set<string>>): boolean {
  for (let i = 0; i < reporterIds.length; i++) {
    const a = memberships.get(reporterIds[i]);
    if (!a) continue;
    for (let j = i + 1; j < reporterIds.length; j++) {
      const b = memberships.get(reporterIds[j]);
      if (!b) continue;
      for (const profileId of a) {
        if (b.has(profileId)) return true;
      }
    }
  }
  return false;
}

/**
 * Pure — rows + membership map -> claims. Grouping key is barcode + direction + (RAW allergen, or
 * null for wrong_product) — exact string, NOT lower(allergen). This deliberately matches
 * recordCorrection.ts's actual corroboration bucket, which is case-sensitive: its threshold query
 * is `allergen = $2` and the unique index (migration 0015) is `(barcode, allergen, direction,
 * reported_by)` with no lower() either — "Sesame" and "sesame" are two independent corroboration
 * buckets there, each needing its own threshold met. communityAdditions.ts's own read-side query
 * groups by `lower(allergen)` instead, for display/propagation purposes — a real, pre-existing
 * case-sensitivity mismatch between the write-side bucket and the read-side display in this
 * codebase. The review queue has to key off the write-side (recordCorrection.ts's) bucket, since
 * that's what actually determines whether a specific report's status is 'pending' or
 * 'corroborated' — grouping by lower(allergen) here would silently merge two claims the engine
 * itself tracks and corroborates independently.
 *
 * Exception: a row with barcode === null (a barcode-less Path C scan's correction) is always its
 * own singleton claim, keyed by its own row id rather than [barcode, direction, allergen] — falling
 * through to the normal key would bucket every null-barcode row on the same allergen/direction
 * together as if they were reports about the same product, when there's no shared identity behind
 * them at all (recordCorrection.ts already never corroborates these for the same reason; this is
 * the display-side half of that same decision). Each shows up in the queue as its own report that
 * explicitly cannot aggregate with any other — never silently dropped, since an admin still needs
 * to be able to see it.
 *
 * Claim status precedence: any row 'corroborated' -> "corroborated"; else any row 'pending' ->
 * "pending"; else (all rejected) -> "rejected". A "corroborated" remove_caution claim here is real
 * but inert for cross-profile effect — loadCommunityAdditions only ever reads add_caution — the UI
 * is responsible for saying so, this function isn't.
 *
 * Pseudonyms are assigned once per claim, in the order rows arrive (fetchCorrectionRows orders by
 * created_at ASC globally, so each claim's rows array is already in that order) — stable across a
 * reject, since rejecting a row never changes its position in this array.
 */
export function groupIntoClaims(
  rows: CorrectionRow[],
  circleMemberships: Map<string, Set<string>>,
): ReviewQueueClaim[] {
  const buckets = new Map<
    string,
    { barcode: string | null; allergen: string | null; direction: Direction; rows: CorrectionRow[] }
  >();

  for (const row of rows) {
    // row.id makes this key unique per row, so a null-barcode row can never land in the same
    // bucket as another one — see the doc comment above.
    const key = row.barcode === null ? JSON.stringify(["no-barcode", row.id]) : JSON.stringify([row.barcode, row.direction, row.allergen]);
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { barcode: row.barcode, allergen: row.allergen, direction: row.direction, rows: [row] });
  }

  const claims: ReviewQueueClaim[] = [];
  for (const { barcode, allergen, direction, rows: claimRows } of buckets.values()) {
    let letterIndex = 0;
    const reports: ReviewQueueReport[] = claimRows.map((row) => {
      const reporterLabel = row.reported_by === null ? "Reporter (account deleted)" : `Reporter ${letterFor(letterIndex++)}`;
      return {
        id: row.id,
        correctionType: row.correction_type,
        target: row.target,
        note: row.note,
        status: row.status,
        createdAt: row.created_at,
        reporterLabel,
        rejectedBy: row.rejected_by !== null ? { email: row.rejected_by_email! } : null,
        rejectedAt: row.rejected_at,
        rejectionReason: row.rejection_reason,
      };
    });

    const liveRows = claimRows.filter((r) => r.status !== "rejected");
    const liveReporterIds = [...new Set(liveRows.map((r) => r.reported_by).filter((id): id is string => id !== null))];
    const deletedAccountReportCount = liveRows.filter((r) => r.reported_by === null).length;

    const status: ClaimStatus = claimRows.some((r) => r.status === "corroborated")
      ? "corroborated"
      : claimRows.some((r) => r.status === "pending")
        ? "pending"
        : "rejected";

    claims.push({
      barcode,
      allergen,
      direction,
      status,
      liveReporterCount: liveReporterIds.length,
      deletedAccountReportCount,
      sameCircleWarning: hasSharedProfile(liveReporterIds, circleMemberships),
      reports,
    });
  }

  return claims;
}

export async function loadReviewQueue(): Promise<ReviewQueueClaim[]> {
  const rows = await fetchCorrectionRows();
  const reporterIds = [...new Set(rows.map((r) => r.reported_by).filter((id): id is string => id !== null))];
  const memberships = await fetchCircleMemberships(reporterIds);
  return groupIntoClaims(rows, memberships);
}

export type RejectResult = {
  id: string;
  status: "rejected";
  // Same { email: string } shape as ReviewQueueReport.rejectedBy, deliberately — the admin route's
  // client patches this response straight into one report's rejectedBy field in local state, which
  // only works if the two types actually match. Non-nullable here (unlike ReviewQueueReport's,
  // which allows null for a historical row whose rejecting admin has since been deleted): this is
  // always the currently-authenticated admin's own row, resolved in the same request.
  rejectedBy: { email: string };
  rejectedAt: string;
  rejectionReason: string | null;
};

/**
 * Transactional, mirroring recordCorrection.ts's own style: SELECT ... FOR UPDATE to read direction
 * + current status before deciding whether a reason is required, then UPDATE.
 *   - 404 if the correction id doesn't exist
 *   - 409 "already_rejected" if status is already 'rejected' — an admin re-clicking a stale page
 *     must not silently overwrite the first admin's rejected_by/rejected_at/rejection_reason
 *   - 400 "rejection_reason_required" if direction is 'add_caution' and reason is empty/whitespace
 *     — the dangerous direction (principle 1: it removes a warning other families are currently
 *     being shown) requires the admin to say why, as the actual stop-and-think step; remove_caution
 *     doesn't, so the two don't feel identical.
 */
export async function rejectCorrection(
  correctionId: string,
  rejectedBy: string,
  reason: string | null,
): Promise<RejectResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query<{ direction: Direction; status: CorrectionStatus }>(
      "SELECT direction, status FROM product_corrections WHERE id = $1 FOR UPDATE",
      [correctionId],
    );
    const existing = existingRows[0];
    if (!existing) throw new HttpError(404, "not_found");
    if (existing.status === "rejected") throw new HttpError(409, "already_rejected");

    const trimmedReason = reason?.trim() || null;
    if (existing.direction === "add_caution" && !trimmedReason) {
      throw new HttpError(400, "rejection_reason_required");
    }

    const { rows: updatedRows } = await client.query<{
      id: string;
      rejected_at: string;
      rejection_reason: string | null;
    }>(
      `UPDATE product_corrections
         SET status = 'rejected', rejected_by = $1, rejected_at = now(), rejection_reason = $2
       WHERE id = $3
       RETURNING id, rejected_at, rejection_reason`,
      [rejectedBy, trimmedReason, correctionId],
    );
    const { rows: adminRows } = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [
      rejectedBy,
    ]);

    await client.query("COMMIT");

    return {
      id: updatedRows[0].id,
      status: "rejected",
      rejectedBy: { email: adminRows[0].email },
      rejectedAt: updatedRows[0].rejected_at,
      rejectionReason: updatedRows[0].rejection_reason,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Answers the orphaned-photo trap directly: no scan_id join, no scan/profile ACL check — unlike
 * corrections.ts's /scans/:scanId/corrections/:id/photo, this resolves a correction's photo by its
 * own id alone, so it works identically whether scan_id is still set or has gone NULL (migration
 * 0020, ON DELETE SET NULL) once the scan it was reported against is purged or deleted.
 */
export async function getCorrectionPhotoPath(correctionId: string): Promise<string | null> {
  const { rows } = await pool.query<{ photo_path: string }>(
    "SELECT photo_path FROM product_corrections WHERE id = $1",
    [correctionId],
  );
  return rows[0]?.photo_path ?? null;
}
