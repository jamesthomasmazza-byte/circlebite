import { applyCommunityCorrectionsIfEnabled, type AppliedCommunityAddition } from "../corrections/applyCommunityCorrections.js";
import { pool } from "../db/pool.js";
import { getProduct as defaultGetProduct } from "../lib/productLookup.js";
import { addTokens, timed, type StepTimings } from "../lib/scanTiming.js";
import { computeVerdict, hasUsableData, type ProductForMatching, type Verdict } from "../matcher/match.js";
import { loadProfileAllergens } from "../matcher/profileAllergens.js";
import type { MatchedAllergenLike } from "../corrections/applyCorrections.js";
import { applyCircleEscalationsIfEnabled, publicCircleReports, type AppliedCircleEscalation } from "../corrections/circleEscalations.js";
import { logAiFailure } from "./aiFailureLog.js";
import { explainVerdict, PHOTO_CHECK_FAILED } from "./explainVerdict.js";
import { extractLabel as defaultExtractLabel, type ExtractLabelDeps } from "./extractLabel.js";
import { mergeVerdict } from "./mergeVerdict.js";
import { reasonVerdict as defaultReasonVerdict, type ReasonVerdictDeps } from "./reasonVerdict.js";

export type LabelScanDeps = {
  extractLabel?: typeof defaultExtractLabel;
  // Passed through to the REAL extractLabel/reasonVerdict (their own callAiVision/callAi/
  // underDailySpendCap seams) when extractLabel/reasonVerdict above aren't overridden wholesale —
  // this is what lets a test exercise the real fail-closed and span-validation logic inside those
  // two functions end to end through runLabelScan, with only the network call itself faked, rather
  // than needing to reimplement that logic in a wholesale fake.
  extractLabelDeps?: ExtractLabelDeps;
  reasonVerdict?: typeof defaultReasonVerdict;
  reasonVerdictDeps?: ReasonVerdictDeps;
  getProduct?: typeof defaultGetProduct;
};

export type LabelScanInput = {
  userId: string;
  allergenProfileId: string;
  /** Carried-forward from a prior barcode scan (the reactive entry point), unvalidated — this
   *  function re-checks it against Open Food Facts itself. Null for the standalone entry point. */
  barcode: string | null;
  imageBuffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Filled in with what each step took, for the route's timing line (lib/scanTiming.ts). */
  timings?: StepTimings;
};

export type LabelScanResult = {
  id: string;
  barcode: string | null;
  product_name: string | null;
  product_brand: null;
  ingredients_text: string | null;
  product_last_updated: null;
  result: Verdict;
  matched_allergens: unknown;
  source: "label_photo";
  confidence: "high" | "medium" | "low" | null;
  created_at: string;
  explanation: string | null;
  extracted_text: string | null;
  extraction_legible: boolean;
  extraction_complete: boolean;
  ingredient_check_incomplete: boolean;
  effective: { result: Verdict; matched_allergens: unknown } | null;
  community_reports: { allergenName: string; reporterCount: number }[];
  pending_circle_reports: Pick<AppliedCircleEscalation, "allergenName" | "reporters">[];
};

function publicCommunityReports(applied: AppliedCommunityAddition[]) {
  return applied.map(({ allergenName, reporterCount }) => ({ allergenName, reporterCount }));
}

/**
 * Path C's orchestration, extracted out of the Express route (scans.ts) into its own
 * dependency-injectable, directly-testable function — the same shape reasonVerdict.ts and
 * extractLabel.ts already use, and what lets this be exercised against real Postgres with an
 * injected fake AI layer rather than needing an HTTP test harness this codebase doesn't otherwise
 * use. The route itself only handles auth, the kill switch, and multipart upload validation before
 * calling this.
 *
 * Never assumes the kill switch or upload validation already ran — those are the route's job — but
 * doesn't re-check them either; this is the part of the pipeline that runs once a photo has already
 * been accepted.
 */
export async function runLabelScan(input: LabelScanInput, deps: LabelScanDeps = {}): Promise<LabelScanResult> {
  const extractLabel = deps.extractLabel ?? defaultExtractLabel;
  const reasonVerdict = deps.reasonVerdict ?? defaultReasonVerdict;
  const getProduct = deps.getProduct ?? defaultGetProduct;

  const allergens = await loadProfileAllergens(input.allergenProfileId);

  // Carried-forward barcode is never trusted as-is: re-validated against Open Food Facts right
  // now, and only attached to this scan if the record still doesn't justify skipping the photo
  // path. Otherwise a stale or mismatched client-remembered barcode (wrong package, mislabeled
  // shelf, or the record simply got fixed since the earlier scan) could end up attached to a photo
  // of a different product's label.
  const timings = input.timings ?? {};
  const checkCarriedBarcode = async (): Promise<string | null> => {
    if (input.barcode === null) return null;
    const [product, lookupMs] = await timed(() => getProduct(input.barcode!));
    timings.lookupMs = lookupMs;
    return hasUsableData(product) ? null : input.barcode;
  };

  // The lookup and the label read don't depend on each other, so they run at the same time
  // (2026-10-30): the scan waits for the slower of the two, not both one after the other. Both
  // results are used exactly as before.
  const [barcode, extraction] = await Promise.all([
    checkCarriedBarcode(),
    timed(() => extractLabel(input.imageBuffer, input.mimeType, deps.extractLabelDeps)).then(([extraction, extractMs]) => {
      timings.extractMs = extractMs;
      return extraction;
    }),
  ]);
  timings.extractAttempts = extraction.attempts;
  if (extraction.ok) addTokens(timings, extraction);

  let verdict: Verdict = "unable_to_confirm";
  let confidence: "high" | "medium" | "low" | null = null;
  let matchedAllergens: unknown = [];
  let explanation: string | null = null;
  let aiResult: Awaited<ReturnType<typeof reasonVerdict>> | null = null;
  let ingredientsText: string | null = null;
  let productName: string | null = null;

  // Barriers 2/3/4 (docs/verdict-engine.md Path C plan §4): an extraction failure, an illegible
  // read, or an incomplete read (the full ingredients statement wasn't in frame — including any
  // "may contain" line) all route the same way, straight to unable_to_confirm, before
  // reasonVerdict is ever called. An incomplete read is the dangerous case: the visible text can
  // transcribe perfectly cleanly while a dropped allergen line leaves no trace anywhere
  // downstream, so it is never treated as a lesser case than an illegible one.
  if (!extraction.ok) {
    logAiFailure("C", "label_reading", extraction.failureReason);
    explanation = PHOTO_CHECK_FAILED;
  } else if (!extraction.legible) {
    explanation = "We couldn't read that label clearly. Try better lighting, a closer photo, or flatten the package.";
  } else if (!extraction.complete) {
    explanation =
      "We could read part of the label, but the ingredients statement looked cut off — make sure the whole " +
      'list, including any "contains" or "may contain" line, is in frame.';
  } else {
    ingredientsText = extraction.ingredientsText;
    productName = extraction.productName;

    const product: ProductForMatching = {
      found: true,
      allergensTags: extraction.contains.map((c) => c.trim().toLowerCase()),
      tracesTags: extraction.mayContain.map((c) => c.trim().toLowerCase()),
      ingredientsText: extraction.ingredientsText,
    };
    const { matchedAllergens: deterministicAllergens } = computeVerdict(allergens, product);

    [aiResult, timings.reasonMs] = await timed(() =>
      reasonVerdict(
        { allergens, ingredientsText: extraction.ingredientsText, deterministicHits: deterministicAllergens },
        deps.reasonVerdictDeps,
      ),
    );
    timings.reasonAttempts = aiResult.attempts;
    addTokens(timings, aiResult);
    if (aiResult.failed) logAiFailure("C", "reasoning", aiResult.failureReason);
    const merged = mergeVerdict(deterministicAllergens, aiResult, allergens, { photoSourced: true });
    verdict = merged.verdict;
    confidence = merged.confidence;
    matchedAllergens = merged.matchedAllergens;
    explanation = explainVerdict(merged, { evidenceSource: "photo", aiFailed: aiResult.failed });
  }

  const { community, communityApplied } = await applyCommunityCorrectionsIfEnabled(
    barcode,
    verdict,
    matchedAllergens as MatchedAllergenLike[],
    allergens,
    input.allergenProfileId,
  );
  // The circle's pending reports on top, as on a barcode scan (routes/scans.ts). A scan not written
  // yet has no reports of its own, so a barcode-less one gets nothing here.
  const circle = await applyCircleEscalationsIfEnabled(
    { profileId: input.allergenProfileId, scanId: null, barcode, viewerId: input.userId },
    community ?? { result: verdict, matchedAllergens: matchedAllergens as MatchedAllergenLike[] },
    allergens,
  );
  const effective = circle ?? community;

  const { rows } = await pool.query(
    `INSERT INTO scans
       (scanner_id, allergen_profile_id, barcode, product_name, product_brand, ingredients_text,
        product_data, product_last_updated, result, matched_allergens, source, confidence,
        community_corrections_applied)
     VALUES ($1, $2, $3, $4, NULL, $5, NULL, NULL, $6, $7, 'label_photo', $8, $9)
     RETURNING id, barcode, product_name, product_brand, ingredients_text, product_last_updated,
               result, matched_allergens, source, confidence, created_at`,
    [
      input.userId,
      input.allergenProfileId,
      barcode,
      productName,
      ingredientsText,
      verdict,
      JSON.stringify(matchedAllergens),
      confidence,
      communityApplied === null ? null : JSON.stringify(communityApplied),
    ],
  );

  if (aiResult) {
    await pool.query(
      `INSERT INTO verdict_explanations
         (scan_id, model, prompt_version, verdict, confidence, findings, unresolved_terms,
          latency_ms, tokens_in, tokens_out, cost_cents, failure_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        rows[0].id,
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

  // Always recorded, success or failure alike — rule 8 (every verdict reproducible) applies to the
  // extraction step too, same reasoning as verdict_explanations above.
  await pool.query(
    `INSERT INTO label_extractions
       (scan_id, model, prompt_version, ingredients_text, product_name, contains, may_contain,
        legible, complete, incomplete_reason, language, failure_reason, latency_ms, tokens_in,
        tokens_out, cost_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      rows[0].id,
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

  return {
    ...rows[0],
    explanation,
    // "Show the user what was read" (docs/verdict-engine.md Path C plan §5) — always present when
    // the photo was legible, regardless of whether a verdict could be reached, so the client can
    // render it against the physical package.
    extracted_text: extraction.ok ? extraction.ingredientsText : null,
    extraction_legible: extraction.ok ? extraction.legible : false,
    extraction_complete: extraction.ok ? extraction.complete : false,
    // Either AI call failed: reading the photo, or reasoning over what it read. An illegible or
    // cut-off read is not a failure — the photo was checked, and its own copy says why it fell short.
    ingredient_check_incomplete: !extraction.ok || (aiResult?.failed ?? false),
    effective: effective && { result: effective.result as Verdict, matched_allergens: effective.matchedAllergens },
    community_reports: publicCommunityReports(community?.applied ?? []),
    pending_circle_reports: publicCircleReports(circle?.applied ?? []),
  };
}
