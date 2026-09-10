import { pool } from "../db/pool.js";

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

export type RecordCorrectionInput = {
  scanId: string;
  reportedBy: string;
  correctionType: CorrectionType;
  /** Required for flag_wrong/flag_missing; must be null for wrong_product, which clears the whole
   *  scan rather than disputing one allergen. */
  allergen: string | null;
  note: string | null;
  photoPath: string;
};

export type RecordCorrectionResult = {
  id: string;
  status: CorrectionStatus;
  corroborated: boolean;
};

type ScanRow = {
  barcode: string;
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
 * claim about the same allergen once you're counting how many people agree.
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
  const { scanId, reportedBy, correctionType, allergen, note, photoPath } = input;

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
          source_text_at_report, note, photo_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      ],
    );
    const inserted = insertRows[0];

    const { rows: countRows } = await client.query<{ count: string }>(
      allergen
        ? `SELECT count(DISTINCT reported_by) FROM product_corrections WHERE barcode = $1 AND allergen = $2 AND direction = $3`
        : `SELECT count(DISTINCT reported_by) FROM product_corrections WHERE barcode = $1 AND allergen IS NULL AND direction = $2`,
      allergen ? [scan.barcode, allergen, direction] : [scan.barcode, direction],
    );
    const reporterCount = Number(countRows[0]?.count ?? 0);
    const threshold = CORROBORATION_THRESHOLD[direction];

    let corroborated = false;
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

    await client.query("COMMIT");

    return { id: inserted.id, status: corroborated ? "corroborated" : inserted.status, corroborated };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
