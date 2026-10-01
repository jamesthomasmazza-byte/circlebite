import { pool } from "../db/pool.js";
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
// caution beats false safety): one report is enough to add a warning, three are needed to remove
// one.
const CORROBORATION_THRESHOLD: Record<Direction, number> = {
  add_caution: 1,
  remove_caution: 3,
};

export type CorrectionOrigin = "user_initiated" | "disagreement_prompt";

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
 * Corroboration is counted per (barcode, allergen, direction) across every reporter, regardless of
 * target — "the AI got this wrong" and "the database is wrong about this" are the same community
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

    const { rows: insertRows } = await client.query<{ id: string; status: CorrectionStatus }>(
      `INSERT INTO product_corrections
         (scan_id, barcode, reported_by, correction_type, direction, allergen, target,
          verdict_explanation_id, verdict_at_report, model_at_report, prompt_version_at_report,
          source_text_at_report, note, photo_path, origin, identity_mismatch_at_report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
    //
    // Rejected rows never count toward the threshold: a report an admin rejected corroborates
    // nothing. Without this, two rejected removals plus one new one reached the remove_caution
    // threshold of 3 — the admin's rejection didn't stop the claim it rejected.
    let corroborated = false;
    if (scan.barcode !== null && !identityMismatched) {
      const { rows: countRows } = await client.query<{ count: string }>(
        allergen
          ? `SELECT count(DISTINCT reported_by) FROM product_corrections
             WHERE barcode = $1 AND allergen = $2 AND direction = $3 AND status <> 'rejected'`
          : `SELECT count(DISTINCT reported_by) FROM product_corrections
             WHERE barcode = $1 AND allergen IS NULL AND direction = $2 AND status <> 'rejected'`,
        allergen ? [scan.barcode, allergen, direction] : [scan.barcode, direction],
      );
      const reporterCount = Number(countRows[0]?.count ?? 0);
      const threshold = CORROBORATION_THRESHOLD[direction];

      if (reporterCount >= threshold) {
        if (direction === "remove_caution" && allergen) {
          const { rows: conflictRows } = await client.query(
            `SELECT 1 FROM product_corrections
             WHERE barcode = $1 AND allergen = $2 AND direction = 'add_caution' AND status = 'corroborated'
             LIMIT 1`,
            [scan.barcode, allergen],
          );
          corroborated = conflictRows.length === 0;
        } else {
          corroborated = true;
        }
      }

      if (corroborated) {
        await client.query(
          allergen
            ? `UPDATE product_corrections SET status = 'corroborated'
               WHERE barcode = $1 AND allergen = $2 AND direction = $3 AND status = 'pending'`
            : `UPDATE product_corrections SET status = 'corroborated'
               WHERE barcode = $1 AND allergen IS NULL AND direction = $2 AND status = 'pending'`,
          allergen ? [scan.barcode, allergen, direction] : [scan.barcode, direction],
        );
      }
    }

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

// The two anti-inflation indexes (migration 0015). Hitting one means this person already has a
// report of this exact claim on this product — a predictable thing for a user to do, not a server
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
