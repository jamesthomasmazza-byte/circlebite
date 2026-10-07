import type { PoolClient } from "pg";

import { pool } from "../db/pool.js";
import { allergenFamilyKey, allergenFoldKey } from "../matcher/match.js";
import { HttpError } from "../lib/httpError.js";

export type CorrectionType = "flag_wrong" | "flag_missing" | "wrong_product";
export type Direction = "add_caution" | "remove_caution";
export type Target = "off_data" | "ai_verdict";
export type CorrectionStatus = "pending" | "corroborated" | "rejected";

// docs/legacy-spec.md §6: flag_missing is the only direction that adds a warning; both flag_wrong
// (an allergen that isn't there) and wrong_product (the whole record is for a different product)
// remove one.
export function directionForCorrectionType(correctionType: CorrectionType): Direction {
  return correctionType === "flag_missing" ? "add_caution" : "remove_caution";
}

// The deliberate asymmetry from docs/legacy-spec.md §6 and docs/principles.md principle 1 (false
// caution beats false safety): fewer families to add a warning than to remove one. Counted in
// families, not reporters (countCorroboratingFamilies). add_caution was 1 until 2026-10-07: one
// report — one account, since signup is open to any adult — put a warning in front of every family
// in the app. Two families means a second household holding the same package saw it too. The
// reporter's own view doesn't wait for either threshold (applyUserCorrections filters on
// reported_by).
export const CORROBORATION_THRESHOLD: Record<Direction, number> = {
  add_caution: 2,
  remove_caution: 3,
};

export type CorrectionOrigin = "user_initiated" | "disagreement_prompt";

/** One corroboration bucket. `key` is the reported allergen's key for this direction (claimKey) —
 *  never the verbatim spelling — or null for wrong_product. */
export type Claim = { barcode: string; key: string | null; direction: Direction };

/**
 * Which stored key a direction's claims are counted on (migration 0043). An addition counts on the
 * family key, which folds synonym clusters: escalation is safe to over-merge, so "Milk" and "Whey"
 * from two families corroborate a warning. A removal counts on the spelling key, which doesn't:
 * three families reporting "Milk", "Lactose" and "Whey" absent have reported three different
 * things, and must not add up to clearing a milk caution — the matcher's own rule, escalate but
 * never clear, applied to the community.
 */
export function claimKeyColumn(direction: Direction): "allergen_family_key" | "allergen_fold_key" {
  return direction === "add_caution" ? "allergen_family_key" : "allergen_fold_key";
}

/** The key an allergen claim in this direction is counted on — what claimKeyColumn holds. */
export function claimKey(allergen: string | null, direction: Direction): string | null {
  if (allergen === null) return null;
  return direction === "add_caution" ? allergenFamilyKey(allergen) : allergenFoldKey(allergen);
}

export type RecordCorrectionInput = {
  scanId: string;
  reportedBy: string;
  correctionType: CorrectionType;
  /** Required for flag_wrong/flag_missing; must be null for wrong_product, which clears the whole
   *  scan rather than disputing one allergen. */
  allergen: string | null;
  note: string | null;
  photoPath: string;
  /** "disagreement_prompt" only for the one flow that pre-fills this from a label_looser row on the
   *  verdict card (docs/principles.md, Sept 27 2026 precedent) — everywhere else, including every
   *  correction this app has ever recorded before that flow existed, is "user_initiated". Never
   *  inferred from correctionType/direction: this is about how the REPORT was prompted, not what
   *  it claims, and defaulting it silently would make every future caller "user_initiated" by
   *  accident, the opposite of the traceability this field exists for. */
  origin: CorrectionOrigin;
};

export type RecordCorrectionResult = {
  id: string;
  status: CorrectionStatus;
  corroborated: boolean;
};

type ScanRow = {
  // Null for a barcode-less Path C scan (docs/verdict-engine.md) — see the corroboration-skip
  // branch below for what that changes.
  barcode: string | null;
  result: string;
  ingredients_text: string | null;
  matched_allergens: { allergenName: string; aiEscalated?: boolean }[];
};

/**
 * Records one circle member's dispute of a verdict, denormalizing the verdict/model/prompt
 * version/source text it disagreed with at write time — docs/principles.md's N17 precedent that a
 * correction must stand on its own, not depend on a join to a row that might later be pruned.
 *
 * target/verdict_explanation_id are derived, not passed in: an allergen the AI escalated
 * (aiEscalated: true on that scan's matched_allergens entry — including an "unresolved" finding the
 * AI raised but couldn't confirm) is a specific, traceable AI claim (target "ai_verdict"); anything
 * else — the deterministic matcher's own hit, or an allergen neither matcher nor AI ever discussed
 * — is disputing the underlying product data instead (target "off_data"), the only mode the
 * original prototype had. wrong_product is always off_data.
 *
 * Corroboration is counted per (barcode, allergen key, direction) across every reporting family,
 * regardless of target. The key, not the verbatim allergen (claimKey, migration 0043): "Peanut",
 * "peanut" and "Peanuts" from three families are one claim in either direction, and "Milk" and
 * "Whey" are one claim only as additions. And regardless of target, because "the AI got
 * this wrong" and "the database is wrong about this" are the same community
 * claim about the same allergen once you're counting how many people agree. Except: a correction
 * against a barcode-less Path C scan (scan.barcode IS NULL) never corroborates at all — see the
 * comment at the corroboration block below for why.
 *
 * Known scope limit: a remove_caution bucket won't auto-corroborate while a corroborated
 * add_caution already exists for the same (barcode, allergen) — legacy-spec §6's "the warning
 * survives" rule — but the reverse isn't handled. An add_caution arriving *after* a remove_caution
 * has already corroborated does not retroactively revert it. Still safe as of Week 8 part 2:
 * corroborated add_caution status now changes what other profiles see
 * (applyCommunityCorrections.ts), but corroborated remove_caution status still doesn't — removals
 * only ever change the reporter's own view. This must be fixed before removals are allowed to
 * propagate.
 */
export async function recordCorrection(input: RecordCorrectionInput): Promise<RecordCorrectionResult> {
  const { scanId, reportedBy, correctionType, allergen, note, photoPath, origin } = input;

  if (correctionType === "wrong_product" && allergen !== null) {
    throw new Error("wrong_product corrections must not specify an allergen");
  }
  if (correctionType !== "wrong_product" && !allergen) {
    throw new Error("allergen is required for flag_wrong/flag_missing corrections");
  }

  const direction = directionForCorrectionType(correctionType);
  const key = claimKey(allergen, direction);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: scanRows } = await client.query<ScanRow>(
      "SELECT barcode, result, ingredients_text, matched_allergens FROM scans WHERE id = $1",
      [scanId],
    );
    const scan = scanRows[0];
    if (!scan) throw new Error(`scan not found: ${scanId}`);

    // A label whose own product identity didn't match the barcode (label_extractions.
    // matched_product_identity = false — docs/verdict-engine.md Path D) still merges into the scan
    // automatically now (the mismatch is an inline note, not a block — see combineScan.ts), and
    // reconcileEvidence's escalate-only invariant means it can't make this scan's own verdict less
    // cautious. What it CAN do is feed a wrong product's allergen data into a correction that then
    // corroborates and changes what other families see for this barcode — checked here, not against
    // "any row for this scan_id", deliberately: a scan combined before this change existed could have
    // more than one label_extractions row (a blocked mismatch attempt, then a later retry that
    // succeeded), so this treats ANY mismatched attempt on this scan as disqualifying, not just the
    // most recent. Over-gating a scan whose retry actually matched is the safe direction; under-
    // gating one that never really matched is not.
    const { rows: mismatchRows } = await client.query<{ mismatched: boolean }>(
      "SELECT true AS mismatched FROM label_extractions WHERE scan_id = $1 AND matched_product_identity = false LIMIT 1",
      [scanId],
    );
    const identityMismatched = mismatchRows.length > 0;

    const matchedEntry = allergen
      ? scan.matched_allergens.find((m) => m.allergenName.toLowerCase() === allergen.toLowerCase())
      : undefined;
    const target: Target = matchedEntry?.aiEscalated ? "ai_verdict" : "off_data";

    let verdictExplanationId: string | null = null;
    let modelAtReport: string | null = null;
    let promptVersionAtReport: string | null = null;
    if (target === "ai_verdict") {
      const { rows: veRows } = await client.query<{ id: string; model: string; prompt_version: string }>(
        "SELECT id, model, prompt_version FROM verdict_explanations WHERE scan_id = $1 ORDER BY created_at DESC LIMIT 1",
        [scanId],
      );
      if (veRows[0]) {
        verdictExplanationId = veRows[0].id;
        modelAtReport = veRows[0].model;
        promptVersionAtReport = veRows[0].prompt_version;
      }
    }

    // This person re-filing a claim an admin already rejected from them (migration 0034) — the same
    // claim by key, so a re-spelling ("peanut" after a rejected "Peanut") is still a re-file: linked to
    // the most recent such rejection, and held out of the corroboration count below — a re-file is
    // new evidence for an admin to look at, not a new vote. Barcode-less reports have no claim
    // across scans to re-file, so they never link.
    let refilesRejectedId: string | null = null;
    if (scan.barcode !== null) {
      const { rows: rejectedRows } = await client.query<{ id: string }>(
        key
          ? `SELECT id FROM product_corrections
             WHERE barcode = $1 AND ${claimKeyColumn(direction)} = $2 AND direction = $3 AND reported_by = $4 AND status = 'rejected'
             ORDER BY rejected_at DESC NULLS LAST, created_at DESC LIMIT 1`
          : `SELECT id FROM product_corrections
             WHERE barcode = $1 AND allergen IS NULL AND direction = $2 AND reported_by = $3 AND status = 'rejected'
             ORDER BY rejected_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        key ? [scan.barcode, key, direction, reportedBy] : [scan.barcode, direction, reportedBy],
      );
      refilesRejectedId = rejectedRows[0]?.id ?? null;
    }

    const { rows: insertRows } = await client.query<{ id: string; status: CorrectionStatus }>(
      `INSERT INTO product_corrections
         (scan_id, barcode, reported_by, correction_type, direction, allergen, target,
          verdict_explanation_id, verdict_at_report, model_at_report, prompt_version_at_report,
          source_text_at_report, note, photo_path, origin, identity_mismatch_at_report, refiles_rejected_id,
          profile_owner_at_report, allergen_fold_key, allergen_family_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               (SELECT p.manager_id FROM scans s JOIN allergen_profiles p ON p.id = s.allergen_profile_id WHERE s.id = $1),
               $18, $19)
       RETURNING id, status`,
      [
        scanId,
        scan.barcode,
        reportedBy,
        correctionType,
        direction,
        allergen,
        target,
        verdictExplanationId,
        scan.result,
        modelAtReport,
        promptVersionAtReport,
        scan.ingredients_text,
        note,
        photoPath,
        origin,
        identityMismatched,
        refilesRejectedId,
        // Both keys on every row, whichever direction it is: a removal's family key is what the
        // warning-survives check below compares against.
        allergen && allergenFoldKey(allergen),
        allergen && allergenFamilyKey(allergen),
      ],
    );
    const inserted = insertRows[0];

    // Barcode-less Path C scan (docs/verdict-engine.md, decision made with JT during planning):
    // there is no reliable cross-user product identity to corroborate a photo-only report against
    // — two different users' "no barcode" corrections on the same allergen/direction could easily
    // be about two entirely different products. So this whole corroboration step is skipped
    // outright rather than run against `barcode = NULL`, which SQL would treat as matching nothing
    // anyway (NULL never equals NULL) but would be the wrong signal to rely on structurally — the
    // skip is explicit here, not incidental. The correction row itself still exists and still
    // overrides the reporter's own view immediately (CONTEST_RULES.md §3); it just never reaches
    // 'corroborated' status, and the admin review queue (reviewQueue.ts) shows it as its own
    // singleton, non-aggregating report rather than folding it into a barcode-keyed claim.
    //
    // identityMismatched is the second, unrelated reason this can skip: a real barcode, but a
    // report filed against a combined scan whose label evidence didn't match the barcode's own
    // product identity (see the comment above where identityMismatched is computed). Same
    // treatment, different cause — one is "no reliable identity to key off," the other is "an
    // identity check already flagged this specific evidence as questionable."
    const corroborated =
      scan.barcode !== null && !identityMismatched
        ? await corroborateClaimIfThresholdMet(client, { barcode: scan.barcode, key, direction })
        : false;

    await client.query("COMMIT");

    return { id: inserted.id, status: corroborated ? "corroborated" : inserted.status, corroborated };
  } catch (err) {
    await client.query("ROLLBACK");
    if (isDuplicateReport(err)) throw new HttpError(409, "already_reported");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The threshold step for one claim, (barcode, allergen key or null for wrong_product, direction): if
 * enough distinct families back it (countCorroboratingFamilies), every pending row in it becomes
 * 'corroborated'. Shared by
 * recordCorrection (a new report) and reviewQueue.ts's acceptCorrection (an admin accepting a
 * re-file), so an accept restores a report's vote rather than overriding the threshold — a removal
 * still needs three people, and the warning still survives a conflicting removal. Runs inside the
 * caller's transaction.
 *
 * Rejected rows never count: a report an admin rejected corroborates nothing. Without this, two
 * rejected removals plus one new one reached the remove_caution threshold of 3 — the admin's
 * rejection didn't stop the claim it rejected.
 *
 * Re-files (refiles_rejected_id set, migration 0034) don't count until an admin accepts them:
 * otherwise a re-file would count as a fresh vote and could undo the rejection for every family
 * on insert. An unaccepted re-file still goes to 'corroborated' along with its
 * claim when independent reporters reach the threshold on their own.
 *
 * A report filed against a mismatched label (identity_mismatch_at_report, migration 0032) neither
 * counts nor is flipped. recordCorrection already skips this step when the new report is the
 * mismatched one; without these two clauses the same report still counted as a family whenever
 * someone else's report ran the threshold, and was then marked 'corroborated' along with the claim
 * — feeding communityAdditions.ts's family-facing count. 0032's gate covers both halves.
 */
export async function corroborateClaimIfThresholdMet(client: PoolClient, claim: Claim): Promise<boolean> {
  const { barcode, key, direction } = claim;
  if ((await countCorroboratingFamilies(client, claim)) < CORROBORATION_THRESHOLD[direction]) return false;

  // The warning survives: a removal never corroborates against a corroborated addition of the same
  // allergen FAMILY — compared on the removal rows' own family keys, so a "Milk" removal is blocked
  // by a corroborated "Whey" warning. Broader than the removal's own (spelling) bucket on purpose:
  // over-blocking a removal is the safe direction.
  if (direction === "remove_caution" && key) {
    const { rows: conflictRows } = await client.query(
      `SELECT 1 FROM product_corrections a
       WHERE a.barcode = $1 AND a.direction = 'add_caution' AND a.status = 'corroborated'
         AND a.allergen_family_key IN (
           SELECT r.allergen_family_key FROM product_corrections r
           WHERE r.barcode = $1 AND r.direction = 'remove_caution' AND r.allergen_fold_key = $2)
       LIMIT 1`,
      [barcode, key],
    );
    if (conflictRows.length > 0) return false;
  }

  await client.query(
    key
      ? `UPDATE product_corrections SET status = 'corroborated'
         WHERE barcode = $1 AND ${claimKeyColumn(direction)} = $2 AND direction = $3 AND status = 'pending' AND NOT identity_mismatch_at_report`
      : `UPDATE product_corrections SET status = 'corroborated'
         WHERE barcode = $1 AND allergen IS NULL AND direction = $2 AND status = 'pending' AND NOT identity_mismatch_at_report`,
    key ? [barcode, key, direction] : [barcode, direction],
  );
  return true;
}

/**
 * How many distinct families back one claim — the number CORROBORATION_THRESHOLD is compared with.
 * A family is the owner of the profile the report was filed from (profile_owner_at_report, migration
 * 0042): an owner and a co-manager of the same child are one household, and a follower scanning for
 * that child is holding that household's package. Falls back to the reporter when the owner's
 * account is gone. A row with neither (both accounts deleted) counts for nothing, as it did when
 * this counted reporters.
 *
 * Same row filters as the threshold has always had — rejected, unaccepted re-files and mismatched
 * labels don't count (corroborateClaimIfThresholdMet has why). Exported so the judge seed can prove
 * its demo claim is corroborated by the rule itself, not by a status it wrote.
 */
export async function countCorroboratingFamilies(client: PoolClient, claim: Claim): Promise<number> {
  const { barcode, key, direction } = claim;
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(DISTINCT COALESCE(profile_owner_at_report, reported_by)) FROM product_corrections
     WHERE barcode = $1 AND ${key ? `${claimKeyColumn(direction)} = $3` : "allergen IS NULL"} AND direction = $2
       AND status <> 'rejected' AND (refiles_rejected_id IS NULL OR accepted_at IS NOT NULL)
       AND NOT identity_mismatch_at_report`,
    key ? [barcode, direction, key] : [barcode, direction],
  );
  return Number(rows[0]?.count ?? 0);
}

// The two anti-inflation indexes (migration 0015, scoped to live rows by 0034). Hitting one means
// this person already has a pending or corroborated report of this exact claim on this product — a predictable thing for a user to do, not a server
// fault, so it's a 409 the client can name rather than a 500 telling them to try again. Matched by
// constraint name, not just the 23505 code, so an unrelated unique violation still surfaces as the
// bug it would be.
const DUPLICATE_REPORT_INDEXES = new Set([
  "product_corrections_no_dup_allergen_report_idx",
  "product_corrections_no_dup_wrong_product_report_idx",
]);

function isDuplicateReport(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string } | null;
  return pgErr?.code === "23505" && pgErr.constraint !== undefined && DUPLICATE_REPORT_INDEXES.has(pgErr.constraint);
}
