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

export type DiscardLabelEvidenceInput = {
  extractionId: string;
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
      // Set when the label's own extracted name didn't match the barcode's — no longer a block
      // (see reconcileEvidence.ts: label evidence can only escalate, never weaken, a barcode
      // finding, so there is nothing a mismatched label can make less cautious). Surfaced as an
      // inline note on the verdict card instead; extraction_id lets that card offer "discard the
      // photo" without a second round trip to look it up.
      identity_mismatch: {
        extraction_id: string;
        off_product_name: string | null;
        extracted_product_name: string | null;
        note: string;
      } | null;
    }
  | {
      // Produced only by discardLabelEvidence below — reverts a combined scan whose label evidence
      // was flagged as an identity mismatch back to its own pre-combine barcode-only verdict,
      // restored from the snapshot taken at combine time (no recomputation, no new AI call: rule 8).
      status: "discarded";
      scan_id: string;
      barcode: string | null;
      result: Verdict;
      confidence: Confidence;
      matched_allergens: MergedAllergenDetail[];
      explanation: string;
      effective: { result: string; matched_allergens: unknown } | null;
      community_reports: { allergenName: string; reporterCount: number }[];
    };

type ScanForCombine = {
  id: string;
  allergen_profile_id: string;
  barcode: string | null;
  product_name: string | null;
  product_brand: string | null;
  result: Verdict;
  confidence: Confidence | null;
  matched_allergens: MergedAllergenDetail[];
  source: string;
};

async function loadScanForCombine(scanId: string): Promise<ScanForCombine> {
  const { rows } = await pool.query<ScanForCombine>(
    `SELECT id, allergen_profile_id, barcode, product_name, product_brand, result, confidence,
            matched_allergens, source
     FROM scans WHERE id = $1`,
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
 *  standalone Path C (labelScan.ts) already does, factored out into its own function since it's a
 *  real AI call: keeping it separate from combineLabelScan's own orchestration is what makes that
 *  function's tests able to inject a fake reasonVerdict without stubbing anything else. */
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
 * so its own AI call is never paid for twice), and reconciled against the label side regardless of
 * whether the two sides' product identity matches.
 *
 * The `scans` UPDATE below is reachable from exactly one place: after a legible, complete
 * extraction. An unreadable/illegible/incomplete photo returns before it, having written nothing to
 * the `scans` row — a genuine identity mismatch used to be a second early-return here too, but isn't
 * anymore (see the `identity` comment below): the merge always proceeds, and a mismatch is only
 * ever a difference in what gets *returned*, not in whether `scans` gets touched.
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

  // No longer a gate (docs/verdict-engine.md Path D, mismatch-demotion follow-up): reconcileEvidence
  // is escalate-only regardless of identity match, so a mismatched label can never make this verdict
  // less cautious than the barcode alone. Every attempt — matched, mismatched, or nothing to compare
  // — proceeds through the exact same merge below; only the returned `identity_mismatch` differs.
  const identity = compareProductIdentity(scan.product_name, scan.product_brand, extraction.productName);

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

  // pre_combine_* snapshots exactly what `scan` was before the UPDATE above overwrote it — the only
  // way discardLabelEvidence can revert this scan to its barcode-only verdict later without
  // recomputing anything (no new AI call, byte-identical to what the barcode-only scan already had).
  const { rows: extractionRows } = await pool.query<{ id: string }>(
    `INSERT INTO label_extractions
       (scan_id, model, prompt_version, ingredients_text, product_name, contains, may_contain,
        legible, complete, incomplete_reason, language, latency_ms, tokens_in, tokens_out,
        cost_cents, matched_product_identity, identity_mismatch_note,
        pre_combine_result, pre_combine_confidence, pre_combine_matched_allergens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
      identity.matched, // true, false, or null when there was nothing to compare
      identity.note,
      scan.result,
      scan.confidence,
      JSON.stringify(scan.matched_allergens),
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
    identity_mismatch:
      identity.matched === false
        ? {
            extraction_id: extractionRows[0].id,
            off_product_name: scan.product_name,
            extracted_product_name: extraction.productName,
            note: identity.note,
          }
        : null,
  };
}

type DiscardableExtraction = {
  scan_id: string;
  allergen_profile_id: string;
  barcode: string | null;
  matched_product_identity: boolean | null;
  identity_confirmed_by_user: boolean | null;
  pre_combine_result: Verdict | null;
  pre_combine_confidence: Confidence | null;
  pre_combine_matched_allergens: MergedAllergenDetail[] | null;
};

async function loadDiscardableExtraction(extractionId: string): Promise<DiscardableExtraction> {
  const { rows } = await pool.query<DiscardableExtraction>(
    `SELECT le.scan_id, s.allergen_profile_id, s.barcode, le.matched_product_identity,
            le.identity_confirmed_by_user, le.pre_combine_result, le.pre_combine_confidence,
            le.pre_combine_matched_allergens
     FROM label_extractions le
     JOIN scans s ON s.id = le.scan_id
     WHERE le.id = $1`,
    [extractionId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "not_found");
  // Only ever offered on the inline mismatch note (Scan.tsx) — restrict it to the same case that
  // note is shown for, rather than a general "undo any combine" action.
  if (row.matched_product_identity !== false) throw new HttpError(400, "not_mismatched");
  if (row.identity_confirmed_by_user !== null) throw new HttpError(400, "already_resolved");
  // Only null for a combine attempt that never actually reached the merge (shouldn't happen for a
  // row with matched_product_identity === false, since that's only ever set on the merge branch —
  // guarded anyway rather than trusting the invariant silently).
  if (row.pre_combine_matched_allergens === null) throw new HttpError(400, "nothing_to_discard");
  return row;
}

/**
 * "That wasn't this product" — the one thing removing the mismatch block (see combineLabelScan
 * above) took away: a way to say a specific label read doesn't belong on this scan. Reverts the
 * scan to its own pre-combine barcode-only verdict, restored from the snapshot combineLabelScan
 * took before ever touching the scan row — no recomputation, no new AI call (rule 8: this has to
 * be reconstructable, and re-deriving it would just be spending money to get back data already on
 * hand). identity_confirmed_by_user records the judgment where it always has: false, same meaning
 * "different product" carried before this flow stopped asking the question up front.
 */
export async function discardLabelEvidence(input: DiscardLabelEvidenceInput): Promise<CombineOutcome> {
  const row = await loadDiscardableExtraction(input.extractionId);
  const allergens = await loadProfileAllergens(row.allergen_profile_id);

  const preCombine = {
    verdict: row.pre_combine_result!,
    confidence: row.pre_combine_confidence!,
    matchedAllergens: row.pre_combine_matched_allergens!,
  };
  const explanation = explainVerdict(preCombine);

  const { community, communityApplied } = await applyCommunityCorrectionsIfEnabled(
    row.barcode,
    preCombine.verdict,
    preCombine.matchedAllergens as MatchedAllergenLike[],
    allergens,
  );

  await pool.query(
    `UPDATE scans
       SET source = 'barcode', result = $2, matched_allergens = $3, confidence = $4,
           community_corrections_applied = $5
     WHERE id = $1`,
    [
      row.scan_id,
      preCombine.verdict,
      JSON.stringify(preCombine.matchedAllergens),
      preCombine.confidence,
      communityApplied === null ? null : JSON.stringify(communityApplied),
    ],
  );
  await pool.query("UPDATE label_extractions SET identity_confirmed_by_user = false WHERE id = $1", [input.extractionId]);

  return {
    status: "discarded",
    scan_id: row.scan_id,
    barcode: row.barcode,
    result: preCombine.verdict,
    confidence: preCombine.confidence,
    matched_allergens: preCombine.matchedAllergens,
    explanation,
    effective: community && { result: community.result, matched_allergens: community.matchedAllergens },
    community_reports: publicCommunityReports(community?.applied ?? []),
  };
}
