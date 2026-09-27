import { applyCommunityCorrectionsIfEnabled, type AppliedCommunityAddition } from "../corrections/applyCommunityCorrections.js";
import type { MatchedAllergenLike } from "../corrections/applyCorrections.js";
import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";
import { computeVerdict, type ProductForMatching, type ProfileAllergen, type Verdict } from "../matcher/match.js";
import { loadProfileAllergens } from "../matcher/profileAllergens.js";
import { compareProductIdentity } from "./productIdentity.js";
import { explainVerdict } from "./explainVerdict.js";
import { extractLabel as defaultExtractLabel, type ExtractLabelDeps } from "./extractLabel.js";
import { mergeVerdict, type Confidence, type MergedAllergenDetail } from "./mergeVerdict.js";
import { reconcileEvidence, type ReconciledAllergenDetail } from "./reconcileEvidence.js";
import { reasonVerdict as defaultReasonVerdict, type ReasonVerdictDeps } from "./reasonVerdict.js";

export type CombineScanDeps = {
  extractLabel?: typeof defaultExtractLabel;
  extractLabelDeps?: ExtractLabelDeps;
  reasonVerdict?: typeof defaultReasonVerdict;
  reasonVerdictDeps?: ReasonVerdictDeps;
};

export type CombineScanInput = {
  scanId: string;
  imageBuffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type ConfirmProductIdentityInput = {
  userId: string;
  extractionId: string;
  decision: "same_product" | "different_product";
};

// effective.result below is typed "string", not Verdict: CommunityEffectiveResult.result
// (applyCorrections.ts's ScanForCorrection) is a plain string throughout this codebase. Every other
// call site (scans.ts, labelScan.ts) escapes noticing the mismatch only because it spreads an
// untyped pool.query() row into the same return object literal, which widens the whole literal to
// `any` and silently suppresses the check. This file builds its return objects explicitly, so the
// annotation has to match what the value actually is.
export type CombineOutcome =
  | { status: "unreadable"; scan_id: string; explanation: string }
  | {
      status: "mismatch";
      scan_id: string;
      extraction_id: string;
      off_product_name: string | null;
      extracted_product_name: string | null;
      extracted_text: string;
      mismatch_note: string;
    }
  | {
      status: "combined";
      scan_id: string;
      barcode: string | null;
      result: Verdict;
      confidence: Confidence;
      matched_allergens: ReconciledAllergenDetail[];
      explanation: string;
      extracted_text: string;
      effective: { result: string; matched_allergens: unknown } | null;
      community_reports: { allergenName: string; reporterCount: number }[];
    }
  | {
      status: "standalone";
      original_scan_id: string;
      scan_id: string;
      // Absent from "combined" above on purpose: that branch updates a scan the client already has
      // full ScanResult context for. This branch is a brand-new scan the client has never seen, so
      // it needs enough to render without a fresh fetch.
      product_name: string | null;
      result: Verdict;
      confidence: Confidence;
      matched_allergens: MergedAllergenDetail[];
      explanation: string;
      extracted_text: string;
      effective: { result: string; matched_allergens: unknown } | null;
      community_reports: { allergenName: string; reporterCount: number }[];
    };

type ScanForCombine = {
  id: string;
  allergen_profile_id: string;
  barcode: string | null;
  product_name: string | null;
  matched_allergens: MergedAllergenDetail[];
  source: string;
};

async function loadScanForCombine(scanId: string): Promise<ScanForCombine> {
  const { rows } = await pool.query<ScanForCombine>(
    "SELECT id, allergen_profile_id, barcode, product_name, matched_allergens, source FROM scans WHERE id = $1",
    [scanId],
  );
  const scan = rows[0];
  if (!scan) throw new HttpError(404, "not_found");
  // A scan can only ever be combined once — re-running this against an already-combined scan would
  // mean re-deriving its barcode side from matched_allergens that already reflect a PRIOR label
  // read, not the original barcode-only evidence reconcileEvidence expects.
  if (scan.source === "combined") throw new HttpError(400, "already_combined");
  return scan;
}

function publicCommunityReports(applied: AppliedCommunityAddition[]) {
  return applied.map(({ allergenName, reporterCount }) => ({ allergenName, reporterCount }));
}

/** The deterministic-plus-AI merge over the label's own extracted text — identical to what today's
 *  standalone Path C (labelScan.ts) already does, factored out here since three call sites in this
 *  file all need exactly this: the initial combine attempt, and both branches of confirming a
 *  mismatch (same_product and different_product each need a real labelSide merge; only which scan
 *  row it ends up attached to differs). */
async function computeLabelSide(
  allergens: ProfileAllergen[],
  ingredientsText: string,
  contains: string[],
  mayContain: string[],
  reasonVerdict: typeof defaultReasonVerdict,
  reasonVerdictDeps: ReasonVerdictDeps | undefined,
) {
  const product: ProductForMatching = {
    found: true,
    allergensTags: contains.map((c) => c.trim().toLowerCase()),
    tracesTags: mayContain.map((c) => c.trim().toLowerCase()),
    ingredientsText,
  };
  const { matchedAllergens: deterministicAllergens } = computeVerdict(allergens, product);
  const aiResult = await reasonVerdict({ allergens, ingredientsText, deterministicHits: deterministicAllergens }, reasonVerdictDeps);
  const merged = mergeVerdict(deterministicAllergens, aiResult, allergens, { photoSourced: true });
  return { aiResult, merged };
}

async function insertVerdictExplanation(
  scanId: string,
  aiResult: Awaited<ReturnType<typeof defaultReasonVerdict>>,
  verdict: Verdict,
  confidence: Confidence,
): Promise<void> {
  await pool.query(
    `INSERT INTO verdict_explanations
       (scan_id, model, prompt_version, verdict, confidence, findings, unresolved_terms,
        latency_ms, tokens_in, tokens_out, cost_cents, failure_reason, evidence_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'label')`,
    [
      scanId,
      aiResult.model,
      aiResult.promptVersion,
      verdict,
      confidence,
      JSON.stringify(aiResult.findings),
      JSON.stringify(aiResult.unresolvedTerms),
      aiResult.latencyMs,
      aiResult.tokensIn,
      aiResult.tokensOut,
      aiResult.costCents,
      aiResult.failureReason,
    ],
  );
}

/**
 * The adaptive scan flow's combine step: a label photo taken against an EXISTING barcode scan,
 * rather than a standalone Path C read. Mirrors labelScan.ts's runLabelScan up through extraction,
 * then diverges — the barcode side is read back from the scan already on file (never recomputed,
 * so its own AI call is never paid for twice), and a product-identity check gates whether anything
 * about that scan is touched at all.
 *
 * THE DRY-RUN GUARANTEE: the `scans` UPDATE statement below is reachable from exactly one place in
 * this function — the branch where `identity.matched !== false`. Every other branch (extraction
 * failure/illegible/incomplete, and a genuine mismatch) returns before that statement is ever
 * built, having written nothing to the `scans` row at all. A blocked mismatch still writes a
 * `label_extractions` row (rule 8 — the extraction call itself is real and reproducible regardless
 * of what happens next), but that's a new, independent row referencing the original scan by FK, not
 * a change to the scan itself. There is no code path that partially applies a combine.
 */
export async function combineLabelScan(input: CombineScanInput, deps: CombineScanDeps = {}): Promise<CombineOutcome> {
  const extractLabel = deps.extractLabel ?? defaultExtractLabel;
  const reasonVerdict = deps.reasonVerdict ?? defaultReasonVerdict;

  const scan = await loadScanForCombine(input.scanId);
  const allergens = await loadProfileAllergens(scan.allergen_profile_id);

  const extraction = await extractLabel(input.imageBuffer, input.mimeType, deps.extractLabelDeps);

  if (!extraction.ok || !extraction.legible || !extraction.complete) {
    await pool.query(
      `INSERT INTO label_extractions
         (scan_id, model, prompt_version, ingredients_text, product_name, contains, may_contain,
          legible, complete, incomplete_reason, language, failure_reason, latency_ms, tokens_in,
          tokens_out, cost_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        scan.id,
        extraction.model,
        extraction.promptVersion,
        extraction.ok ? extraction.ingredientsText : null,
        extraction.ok ? extraction.productName : null,
        JSON.stringify(extraction.ok ? extraction.contains : []),
        JSON.stringify(extraction.ok ? extraction.mayContain : []),
        extraction.ok ? extraction.legible : null,
        extraction.ok ? extraction.complete : null,
        extraction.ok ? extraction.incompleteReason : null,
        extraction.ok ? extraction.language : null,
        extraction.ok ? null : extraction.failureReason,
        extraction.ok ? extraction.latencyMs : null,
        extraction.ok ? extraction.tokensIn : null,
        extraction.ok ? extraction.tokensOut : null,
        extraction.ok ? extraction.costCents : null,
      ],
    );

    const explanation = !extraction.ok
      ? "We couldn't read that photo right now. Try again."
      : !extraction.legible
        ? "We couldn't read that label clearly. Try better lighting, a closer photo, or flatten the package."
        : "We could read part of the label, but the ingredients statement looked cut off — make sure the whole " +
          'list, including any "contains" or "may contain" line, is in frame.';

    // Nothing above touched `scans` — the original barcode scan stands exactly as it was.
    return { status: "unreadable", scan_id: scan.id, explanation };
  }

  const identity = compareProductIdentity(scan.product_name, extraction.productName);

  if (identity.matched === false) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO label_extractions
         (scan_id, model, prompt_version, ingredients_text, product_name, contains, may_contain,
          legible, complete, incomplete_reason, language, latency_ms, tokens_in, tokens_out,
          cost_cents, matched_product_identity, identity_mismatch_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false, $16)
       RETURNING id`,
      [
        scan.id,
        extraction.model,
        extraction.promptVersion,
        extraction.ingredientsText,
        extraction.productName,
        JSON.stringify(extraction.contains),
        JSON.stringify(extraction.mayContain),
        extraction.legible,
        extraction.complete,
        extraction.incompleteReason,
        extraction.language,
        extraction.latencyMs,
        extraction.tokensIn,
        extraction.tokensOut,
        extraction.costCents,
        identity.note,
      ],
    );

    // Deliberately no reasonVerdict call yet — spending on the AI reasoning step before knowing
    // whether this photo will even be used would be wasted if the user says "different product".
    // Nothing above touched `scans` either — this is the dry-run branch the guarantee is about.
    return {
      status: "mismatch",
      scan_id: scan.id,
      extraction_id: rows[0].id,
      off_product_name: scan.product_name,
      extracted_product_name: extraction.productName,
      extracted_text: extraction.ingredientsText,
      mismatch_note: identity.note,
    };
  }

  // identity.matched is true or null (nothing to compare) — proceed to merge.
  const { aiResult, merged: labelSide } = await computeLabelSide(
    allergens,
    extraction.ingredientsText,
    extraction.contains,
    extraction.mayContain,
    reasonVerdict,
    deps.reasonVerdictDeps,
  );

  const reconciled = reconcileEvidence(scan.matched_allergens, labelSide.matchedAllergens);
  const explanation = explainVerdict(reconciled, { photoSourced: scan.matched_allergens.length === 0 });

  const { community, communityApplied } = await applyCommunityCorrectionsIfEnabled(
    scan.barcode,
    reconciled.verdict,
    reconciled.matchedAllergens as MatchedAllergenLike[],
    allergens,
  );

  await pool.query(
    `UPDATE scans
       SET source = 'combined', result = $2, matched_allergens = $3, confidence = $4,
           community_corrections_applied = $5
     WHERE id = $1`,
    [
      scan.id,
      reconciled.verdict,
      JSON.stringify(reconciled.matchedAllergens),
      reconciled.confidence,
      communityApplied === null ? null : JSON.stringify(communityApplied),
    ],
  );

  await insertVerdictExplanation(scan.id, aiResult, reconciled.verdict, reconciled.confidence);

  await pool.query(
    `INSERT INTO label_extractions
       (scan_id, model, prompt_version, ingredients_text, product_name, contains, may_contain,
        legible, complete, incomplete_reason, language, latency_ms, tokens_in, tokens_out,
        cost_cents, matched_product_identity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      scan.id,
      extraction.model,
      extraction.promptVersion,
      extraction.ingredientsText,
      extraction.productName,
      JSON.stringify(extraction.contains),
      JSON.stringify(extraction.mayContain),
      extraction.legible,
      extraction.complete,
      extraction.incompleteReason,
      extraction.language,
      extraction.latencyMs,
      extraction.tokensIn,
      extraction.tokensOut,
      extraction.costCents,
      identity.matched, // true, or null when there was nothing to compare
    ],
  );

  return {
    status: "combined",
    scan_id: scan.id,
    barcode: scan.barcode,
    result: reconciled.verdict,
    confidence: reconciled.confidence,
    matched_allergens: reconciled.matchedAllergens,
    explanation,
    extracted_text: extraction.ingredientsText,
    effective: community && { result: community.result, matched_allergens: community.matchedAllergens },
    community_reports: publicCommunityReports(community?.applied ?? []),
  };
}

type PendingMismatch = {
  extraction_id: string;
  scan_id: string;
  allergen_profile_id: string;
  barcode: string | null;
  matched_allergens: MergedAllergenDetail[];
  ingredients_text: string;
  product_name: string | null;
  contains: string[];
  may_contain: string[];
  identity_confirmed_by_user: boolean | null;
};

async function loadPendingMismatch(extractionId: string): Promise<PendingMismatch> {
  const { rows } = await pool.query<PendingMismatch>(
    `SELECT le.id AS extraction_id, le.scan_id, s.allergen_profile_id, s.barcode, s.matched_allergens,
            le.ingredients_text, le.product_name, le.contains, le.may_contain, le.identity_confirmed_by_user
     FROM label_extractions le
     JOIN scans s ON s.id = le.scan_id
     WHERE le.id = $1 AND le.matched_product_identity = false`,
    [extractionId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "not_found");
  if (row.identity_confirmed_by_user !== null) throw new HttpError(400, "already_resolved");
  return row;
}

/**
 * Resolves a pending mismatch from combineLabelScan. Reads the extraction back from
 * label_extractions rather than re-running the vision call — the photo was already processed once,
 * and this never touches it again either way.
 *
 * same_product: proceeds to the exact merge-and-update combineLabelScan's own proceed branch would
 * have run, against the SAME scan row. different_product: the original scan is still never
 * touched — a brand new standalone scan is inserted instead (today's existing barcode-less Path C
 * shape), so the user's photo still produces an answer without ever attaching it to a barcode it
 * turned out not to belong to.
 */
export async function confirmProductIdentity(input: ConfirmProductIdentityInput, deps: CombineScanDeps = {}): Promise<CombineOutcome> {
  const reasonVerdict = deps.reasonVerdict ?? defaultReasonVerdict;
  const pending = await loadPendingMismatch(input.extractionId);
  const allergens = await loadProfileAllergens(pending.allergen_profile_id);

  const { aiResult, merged: labelSide } = await computeLabelSide(
    allergens,
    pending.ingredients_text,
    pending.contains,
    pending.may_contain,
    reasonVerdict,
    deps.reasonVerdictDeps,
  );

  if (input.decision === "same_product") {
    const reconciled = reconcileEvidence(pending.matched_allergens, labelSide.matchedAllergens);
    const explanation = explainVerdict(reconciled, { photoSourced: pending.matched_allergens.length === 0 });

    const { community, communityApplied } = await applyCommunityCorrectionsIfEnabled(
      pending.barcode,
      reconciled.verdict,
      reconciled.matchedAllergens as MatchedAllergenLike[],
      allergens,
    );

    await pool.query(
      `UPDATE scans
         SET source = 'combined', result = $2, matched_allergens = $3, confidence = $4,
             community_corrections_applied = $5
       WHERE id = $1`,
      [
        pending.scan_id,
        reconciled.verdict,
        JSON.stringify(reconciled.matchedAllergens),
        reconciled.confidence,
        communityApplied === null ? null : JSON.stringify(communityApplied),
      ],
    );
    await insertVerdictExplanation(pending.scan_id, aiResult, reconciled.verdict, reconciled.confidence);
    await pool.query("UPDATE label_extractions SET identity_confirmed_by_user = true WHERE id = $1", [pending.extraction_id]);

    return {
      status: "combined",
      scan_id: pending.scan_id,
      barcode: pending.barcode,
      result: reconciled.verdict,
      confidence: reconciled.confidence,
      matched_allergens: reconciled.matchedAllergens,
      explanation,
      extracted_text: pending.ingredients_text,
      effective: community && { result: community.result, matched_allergens: community.matchedAllergens },
      community_reports: publicCommunityReports(community?.applied ?? []),
    };
  }

  // different_product: the original barcode scan is untouched — a new, barcode-less scan is
  // created from the label evidence alone, same shape as today's standalone Path C.
  const explanation = explainVerdict(labelSide, { photoSourced: true });
  const { community, communityApplied } = await applyCommunityCorrectionsIfEnabled(
    null,
    labelSide.verdict,
    labelSide.matchedAllergens as MatchedAllergenLike[],
    allergens,
  );

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans
       (scanner_id, allergen_profile_id, barcode, product_name, product_brand, ingredients_text,
        product_data, product_last_updated, result, matched_allergens, source, confidence,
        community_corrections_applied)
     VALUES ($1, $2, NULL, $3, NULL, $4, NULL, NULL, $5, $6, 'label_photo', $7, $8)
     RETURNING id`,
    [
      input.userId,
      pending.allergen_profile_id,
      pending.product_name,
      pending.ingredients_text,
      labelSide.verdict,
      JSON.stringify(labelSide.matchedAllergens),
      labelSide.confidence,
      communityApplied === null ? null : JSON.stringify(communityApplied),
    ],
  );
  const newScanId = rows[0].id;

  await insertVerdictExplanation(newScanId, aiResult, labelSide.verdict, labelSide.confidence);

  // A fresh label_extractions row for the NEW scan — the original row (still pointed at the scan
  // this photo was attempted against) is never repointed, just marked resolved below, so it stays
  // an accurate record of what was actually attempted against that scan.
  await pool.query(
    `INSERT INTO label_extractions
       (scan_id, model, prompt_version, ingredients_text, product_name, contains, may_contain,
        legible, complete, language)
     SELECT $1, model, prompt_version, ingredients_text, product_name, contains, may_contain, legible, complete, language
     FROM label_extractions WHERE id = $2`,
    [newScanId, pending.extraction_id],
  );

  await pool.query("UPDATE label_extractions SET identity_confirmed_by_user = false WHERE id = $1", [pending.extraction_id]);

  return {
    status: "standalone",
    original_scan_id: pending.scan_id,
    scan_id: newScanId,
    product_name: pending.product_name,
    result: labelSide.verdict,
    confidence: labelSide.confidence,
    matched_allergens: labelSide.matchedAllergens,
    explanation,
    extracted_text: pending.ingredients_text,
    effective: community && { result: community.result, matched_allergens: community.matchedAllergens },
    community_reports: publicCommunityReports(community?.applied ?? []),
  };
}
