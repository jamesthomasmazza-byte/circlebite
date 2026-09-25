import {
  applyCommunityCorrections,
  type AppliedCommunityAddition,
  type CommunityAddition,
} from "../corrections/applyCommunityCorrections.js";
import { loadCommunityAdditions } from "../corrections/communityAdditions.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { getProduct as defaultGetProduct } from "../lib/productLookup.js";
import { computeVerdict, type ProductForMatching, type ProfileAllergen, type Severity, type Verdict } from "../matcher/match.js";
import type { MatchedAllergenLike } from "../corrections/applyCorrections.js";
import { explainVerdict } from "./explainVerdict.js";
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
  effective: { result: Verdict; matched_allergens: unknown } | null;
  community_reports: { allergenName: string; reporterCount: number }[];
};

function publicCommunityReports(applied: AppliedCommunityAddition[]) {
  return applied.map(({ allergenName, reporterCount }) => ({ allergenName, reporterCount }));
}

/**
 * Same shape as match.ts's own hasUsableData check (not exported, so this mirrors it rather than
 * reaching into its internals) — decides whether a re-fetched Open Food Facts record still
 * justifies attaching its barcode to a Path C scan.
 */
function productHasUsableData(product: { found: boolean; allergensTags: string[]; tracesTags: string[]; ingredientsText: string | null }): boolean {
  return product.found && (product.allergensTags.length > 0 || product.tracesTags.length > 0 || Boolean(product.ingredientsText));
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

  const { rows: allergenRows } = await pool.query<{
    name: string;
    severity: Severity;
    treat_traces_as_unsafe: boolean;
  }>("SELECT name, severity, treat_traces_as_unsafe FROM allergens WHERE allergen_profile_id = $1", [
    input.allergenProfileId,
  ]);
  const allergens: ProfileAllergen[] = allergenRows.map((a) => ({
    name: a.name,
    severity: a.severity,
    treatTracesAsUnsafe: a.treat_traces_as_unsafe,
  }));

  // Carried-forward barcode is never trusted as-is: re-validated against Open Food Facts right
  // now, and only attached to this scan if the record still doesn't justify skipping the photo
  // path. Otherwise a stale or mismatched client-remembered barcode (wrong package, mislabeled
  // shelf, or the record simply got fixed since the earlier scan) could end up attached to a photo
  // of a different product's label.
  const barcode: string | null =
    input.barcode !== null && !productHasUsableData(await getProduct(input.barcode)) ? input.barcode : null;

  const extraction = await extractLabel(input.imageBuffer, input.mimeType, deps.extractLabelDeps);

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
    explanation = "We couldn't read that photo right now. Try again, or enter the barcode if you have one.";
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

    aiResult = await reasonVerdict(
      { allergens, ingredientsText: extraction.ingredientsText, deterministicHits: deterministicAllergens },
      deps.reasonVerdictDeps,
    );
    const merged = mergeVerdict(deterministicAllergens, aiResult, allergens, { photoSourced: true });
    verdict = merged.verdict;
    confidence = merged.confidence;
    matchedAllergens = merged.matchedAllergens;
    explanation = explainVerdict(merged, { photoSourced: true });
  }

  // Community corrections only apply when a real barcode is attached — nothing to key the lookup
  // on otherwise (loadCommunityAdditions/applyCommunityCorrections are both barcode-keyed).
  let community: ReturnType<typeof applyCommunityCorrections> = null;
  let communityApplied: AppliedCommunityAddition[] | null = null;
  if (env.communityCorrections && barcode) {
    const additions: CommunityAddition[] = (await loadCommunityAdditions([barcode])).get(barcode) ?? [];
    community = applyCommunityCorrections(
      { result: verdict, matchedAllergens: matchedAllergens as MatchedAllergenLike[] },
      allergens,
      additions,
    );
    communityApplied = community?.applied ?? [];
  }

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
    effective: community && { result: community.result, matched_allergens: community.matchedAllergens },
    community_reports: publicCommunityReports(community?.applied ?? []),
  };
}
