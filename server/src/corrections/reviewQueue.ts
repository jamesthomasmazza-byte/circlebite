import { HttpError } from "../lib/httpError.js";
import { pool } from "../db/pool.js";
import {
  claimKeyColumn,
  corroborateClaimIfThresholdMet,
  type CorrectionOrigin,
  type CorrectionStatus,
  type CorrectionType,
  type Direction,
  type Target,
} from "./recordCorrection.js";

export type ReviewQueueReportStatus = CorrectionStatus;
export type ClaimStatus = CorrectionStatus;

export type ReviewQueueReport = {
  id: string;
  correctionType: CorrectionType;
  target: Target;
  note: string | null;
  status: ReviewQueueReportStatus;
  createdAt: string;
  // Never a real identity. Assigned once per reporter per claim over ALL reports (live + rejected),
  // ordered by createdAt, so a pseudonym never shifts after another report in the same claim is
  // rejected, and a re-file carries the same label as the report it re-files.
  reporterLabel: string; // "Reporter A" | "Reporter B" | ... | "Reporter (account deleted)"
  rejectedBy: { email: string } | null; // admin accountability, shown in full — not user health data
  rejectedAt: string | null;
  rejectionReason: string | null;
  // "disagreement_prompt" for a report filed from the verdict card's label_looser row (the app
  // asked; the reporter attested to reading the package) versus "user_initiated" for everything
  // else. A cluster of disagreement_prompt reports on one claim reads differently to an admin than
  // a cluster of spontaneous ones — see docs/principles.md's Sept 27 2026 precedent.
  origin: CorrectionOrigin;
  // Set when this report re-files a claim an admin already rejected from the same reporter
  // (migration 0034) — the id of that rejected report, which sits in the same claim under the same
  // pseudonym. A re-file is held out of corroboration until an admin accepts it.
  refilesRejectedId: string | null;
  acceptedBy: { email: string } | null; // admin accountability, same as rejectedBy
  acceptedAt: string | null;
};

export type ReviewQueueClaim = {
  // Null for a claim built from a barcode-less Path C scan's correction (docs/verdict-engine.md) —
  // see groupIntoClaims below for why every such row is always its own singleton claim.
  barcode: string | null;
  // Every distinct spelling the claim's reports used, joined with " / " ("Peanut / peanuts"); null
  // only for wrong_product.
  allergen: string | null;
  direction: Direction;
  status: ClaimStatus;
  // DISTINCT reported_by among non-rejected rows, excluding NULL — live accounts backing the claim.
  // NOT the number the threshold compares: since 2026-10-07 that counts families
  // (recordCorrection.ts, countCorroboratingFamilies), so an owner and co-manager are two here and
  // one there; sameCircleWarning below is what flags that. A re-file not yet accepted (migration
  // 0034) is live here but held out of the threshold; the page marks those reports individually.
  // Also NOT the same as communityAdditions.ts's own
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
  allergen_fold_key: string | null;
  allergen_family_key: string | null;
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
  origin: CorrectionOrigin;
  refiles_rejected_id: string | null;
  accepted_at: string | null;
  accepted_by_email: string | null;
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
       pc.id, pc.barcode, pc.allergen, pc.allergen_fold_key, pc.allergen_family_key, pc.direction, pc.correction_type, pc.target, pc.note,
       pc.status, pc.created_at, pc.reported_by, pc.rejected_by, pc.rejected_at,
       pc.rejection_reason, pc.origin, rejector.email AS rejected_by_email,
       pc.refiles_rejected_id, pc.accepted_at, acceptor.email AS accepted_by_email
     FROM product_corrections pc
     LEFT JOIN users rejector ON rejector.id = pc.rejected_by
     LEFT JOIN users acceptor ON acceptor.id = pc.accepted_by
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
 * Pure — rows + membership map -> claims. Grouping key is barcode + direction + (the direction's
 * claim key, or null for wrong_product) — exactly recordCorrection.ts's corroboration bucket, since
 * that's what determines whether a report is 'pending' or 'corroborated'. Additions group on the
 * family key ("Milk" and "Dairy" are one warning claim), removals on the spelling key ("Milk" and
 * "Lactose" reported absent are two claims, each with its own count) — claimKeyColumn has why.
 * "Sesame" and "sesame" are one claim either way. communityAdditions.ts groups additions on the
 * same family key, so the queue, the threshold and what families see agree. The claim's `allergen` lists each distinct spelling its reports used, in
 * the order they arrived, so an admin sees what reporters actually wrote.
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
/** The row's claim key for its direction; null for wrong_product (no allergen). A row that names an
 *  allergen but has no key yet (written by the previous release mid-deploy, before 0044) is its own
 *  claim — never merged into another allergen's. */
function claimGroupKey(row: CorrectionRow): string | null {
  if (row.allergen === null) return null;
  return row[claimKeyColumn(row.direction)] ?? `unkeyed:${row.id}`;
}

export function groupIntoClaims(
  rows: CorrectionRow[],
  circleMemberships: Map<string, Set<string>>,
): ReviewQueueClaim[] {
  const buckets = new Map<
    string,
    { barcode: string | null; direction: Direction; rows: CorrectionRow[] }
  >();

  for (const row of rows) {
    // row.id makes this key unique per row, so a null-barcode row can never land in the same
    // bucket as another one — see the doc comment above.
    const key =
      row.barcode === null
        ? JSON.stringify(["no-barcode", row.id])
        : JSON.stringify([row.barcode, row.direction, claimGroupKey(row)]);
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { barcode: row.barcode, direction: row.direction, rows: [row] });
  }

  const claims: ReviewQueueClaim[] = [];
  for (const { barcode, direction, rows: claimRows } of buckets.values()) {
    const spellings = [...new Set(claimRows.map((r) => r.allergen).filter((a): a is string => a !== null))];
    const allergen = spellings.length > 0 ? spellings.join(" / ") : null;
    // One letter per reporter, not per row: since migration 0034 a reporter can have a rejected
    // report and its re-file in the same claim, and lettering them separately would make one person
    // read as two independent reporters backing the claim.
    const letters = new Map<string, string>();
    const reports: ReviewQueueReport[] = claimRows.map((row) => {
      let reporterLabel = "Reporter (account deleted)";
      if (row.reported_by !== null) {
        if (!letters.has(row.reported_by)) letters.set(row.reported_by, `Reporter ${letterFor(letters.size)}`);
        reporterLabel = letters.get(row.reported_by)!;
      }
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
        origin: row.origin,
        refilesRejectedId: row.refiles_rejected_id,
        acceptedBy: row.accepted_at !== null && row.accepted_by_email !== null ? { email: row.accepted_by_email } : null,
        acceptedAt: row.accepted_at,
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

export type AcceptResult = {
  id: string;
  // 'corroborated' if accepting this report's vote met its claim's threshold; 'pending' if not (a
  // removal still short of three reporters, or one a corroborated warning outranks).
  status: "pending" | "corroborated";
  acceptedBy: { email: string };
  acceptedAt: string;
};

/**
 * An admin accepting a re-filed report (migration 0034/0035): the review that lets a re-file's vote
 * count again, then the same threshold step a new report runs (corroborateClaimIfThresholdMet) — an
 * accept restores the vote, it never overrides the threshold.
 *   - 404 if the correction id doesn't exist
 *   - 409 "not_acceptable" unless it's a pending, not-yet-accepted re-file that could corroborate at
 *     all — an ordinary report needs no accept (it already counts), and a mismatched-label report
 *     never corroborates (recordCorrection.ts), so accepting one must not be a way around that.
 * Transactional with FOR UPDATE, mirroring rejectCorrection, so two admins can't both accept.
 */
export async function acceptCorrection(correctionId: string, acceptedBy: string): Promise<AcceptResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query<{
      barcode: string | null;
      allergen_fold_key: string | null;
      allergen_family_key: string | null;
      direction: Direction;
      status: CorrectionStatus;
      refiles_rejected_id: string | null;
      accepted_at: string | null;
      identity_mismatch_at_report: boolean;
    }>(
      `SELECT barcode, allergen_fold_key, allergen_family_key, direction, status, refiles_rejected_id, accepted_at, identity_mismatch_at_report
       FROM product_corrections WHERE id = $1 FOR UPDATE`,
      [correctionId],
    );
    const existing = existingRows[0];
    if (!existing) throw new HttpError(404, "not_found");
    if (
      existing.status !== "pending" ||
      existing.refiles_rejected_id === null ||
      existing.accepted_at !== null ||
      existing.barcode === null ||
      existing.identity_mismatch_at_report
    ) {
      throw new HttpError(409, "not_acceptable");
    }

    const { rows: updatedRows } = await client.query<{ accepted_at: string }>(
      "UPDATE product_corrections SET accepted_by = $1, accepted_at = now() WHERE id = $2 RETURNING accepted_at",
      [acceptedBy, correctionId],
    );
    const corroborated = await corroborateClaimIfThresholdMet(client, {
      barcode: existing.barcode,
      key: existing[claimKeyColumn(existing.direction)],
      direction: existing.direction,
    });
    const { rows: adminRows } = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [
      acceptedBy,
    ]);

    await client.query("COMMIT");

    return {
      id: correctionId,
      status: corroborated ? "corroborated" : "pending",
      acceptedBy: { email: adminRows[0].email },
      acceptedAt: updatedRows[0].accepted_at,
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
