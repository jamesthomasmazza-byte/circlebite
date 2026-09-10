import { Router } from "express";

import { assertCanReadProfile } from "../authorization/profiles.js";
import { requireAuth } from "../auth/requireAuth.js";
import { applyUserCorrections, type UserCorrection } from "../corrections/applyCorrections.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { getProduct } from "../lib/productLookup.js";
import { computeVerdict, type ProfileAllergen, type Severity } from "../matcher/match.js";
import { explainVerdict } from "../verdict/explainVerdict.js";
import { mergeVerdict } from "../verdict/mergeVerdict.js";
import { reasonVerdict } from "../verdict/reasonVerdict.js";

// No router-level .use(requireAuth) here on purpose: this router's two routes ("/scans" and
// "/profiles/:id/scans") don't share a mountable common prefix the way profilesRouter's do, so a
// blanket .use(requireAuth) would force mounting at bare /api — exactly the scoping bug fixed in
// an earlier commit (a router-level auth middleware intercepting an unrelated router's public
// routes before Express even checks whether any of its own routes match). requireAuth applied
// per-route instead, same pattern circleRouter already uses safely.
export const scansRouter = Router();

const HISTORY_LIMIT = 20; // "the last handful," not deep history — CONTEST_RULES.md §7
const BARCODE_PATTERN = /^\d{6,14}$/;

scansRouter.post(
  "/scans",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { allergenProfileId, barcode } = req.body ?? {};
    if (typeof allergenProfileId !== "string" || typeof barcode !== "string" || !BARCODE_PATTERN.test(barcode)) {
      throw new HttpError(400, "invalid_request");
    }

    // assertCanReadProfile, not assertCanManageProfile: scanning is what following is for
    // (docs/legacy-spec.md §5 — "view a profile and scan on its behalf"). The one deliberate
    // exception to the manage-only pattern used by every other mutating route so far.
    await assertCanReadProfile(req.user!.id, allergenProfileId);

    // Always the profile's FULL allergen list, never filtered by the scanner's own share_level —
    // filtering the safety check itself by what a severe_only follower happens to be shown could
    // mean a real (if mild) allergen gets missed entirely during an actual purchase decision.
    const { rows: allergenRows } = await pool.query<{
      name: string;
      severity: Severity;
      treat_traces_as_unsafe: boolean;
    }>("SELECT name, severity, treat_traces_as_unsafe FROM allergens WHERE allergen_profile_id = $1", [
      allergenProfileId,
    ]);
    const allergens: ProfileAllergen[] = allergenRows.map((a) => ({
      name: a.name,
      severity: a.severity,
      treatTracesAsUnsafe: a.treat_traces_as_unsafe,
    }));

    const product = await getProduct(barcode);
    const { verdict: deterministicVerdict, matchedAllergens: deterministicAllergens } = computeVerdict(
      allergens,
      product,
    );

    // Path B (docs/verdict-engine.md): a barcode found on a product with only free ingredient
    // text and no structured allergen data at all. Everything else (structured tags present, or
    // no product data to reason over) is untouched — the deterministic verdict stands exactly as
    // it does today.
    const isPathB =
      product.found &&
      Boolean(product.ingredientsText) &&
      product.allergensTags.length === 0 &&
      product.tracesTags.length === 0;

    let verdict = deterministicVerdict;
    let confidence: "high" | "medium" | "low" | null = null;
    let matchedAllergens: unknown = deterministicAllergens;
    let explanation: string | null = null;
    let aiResult: Awaited<ReturnType<typeof reasonVerdict>> | null = null;

    if (isPathB) {
      aiResult = await reasonVerdict({
        allergens,
        ingredientsText: product.ingredientsText!,
        deterministicHits: deterministicAllergens,
      });
      const merged = mergeVerdict(deterministicAllergens, aiResult, allergens);
      verdict = merged.verdict;
      confidence = merged.confidence;
      matchedAllergens = merged.matchedAllergens;
      explanation = explainVerdict(merged);
    }

    const { rows } = await pool.query(
      `INSERT INTO scans
         (scanner_id, allergen_profile_id, barcode, product_name, product_brand, ingredients_text,
          product_data, product_last_updated, result, matched_allergens, source, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'barcode', $11)
       RETURNING id, barcode, product_name, product_brand, ingredients_text, product_last_updated,
                 result, matched_allergens, source, confidence, created_at`,
      [
        req.user!.id,
        allergenProfileId,
        barcode,
        product.name,
        product.brand,
        product.ingredientsText,
        JSON.stringify(product.raw),
        product.lastUpdated,
        verdict,
        JSON.stringify(matchedAllergens),
        confidence,
      ],
    );

    // Recorded whether the AI call succeeded or failed — rule 8 (every verdict reproducible)
    // applies to fail-closed outcomes too, and the week-8 accuracy report needs failed attempts
    // visible, not just successful ones.
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

    // Full detail, unfiltered — this is the live, active-decision response, not history. See the
    // GET handler below for why history gets the opposite treatment.
    res.status(201).json({ ...rows[0], explanation });
  }),
);

scansRouter.get(
  "/profiles/:id/scans",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const access = await assertCanReadProfile(req.user!.id, profileId);

    const { rows } = await pool.query(
      `SELECT id, barcode, product_name, product_brand, result, matched_allergens, created_at
       FROM scans
       WHERE allergen_profile_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [profileId, HISTORY_LIMIT],
    );

    // CONTEST_RULES.md §3: a user's own correction overrides the verdict for their view
    // immediately. Only this requester's own corrections — never someone else's, and never
    // silently: the original always ships alongside the effective override, in the response below.
    const { rows: correctionRows } = await pool.query<
      { scan_id: string } & Pick<UserCorrection, "id" | "correctionType" | "direction" | "allergen" | "note" | "status" | "createdAt">
    >(
      `SELECT id, scan_id, correction_type AS "correctionType", direction, allergen, note, status,
              created_at AS "createdAt"
       FROM product_corrections
       WHERE scan_id = ANY($1) AND reported_by = $2
       ORDER BY created_at ASC`,
      [rows.map((r) => r.id), req.user!.id],
    );
    const correctionsByScanId = new Map<string, UserCorrection[]>();
    for (const { scan_id, ...correction } of correctionRows) {
      const existing = correctionsByScanId.get(scan_id) ?? [];
      existing.push(correction);
      correctionsByScanId.set(scan_id, existing);
    }

    // Unlike the live scan result, history is browsing at leisure, not an active safety decision
    // — the same category of access the profile page's own severity filtering already applies to
    // a severe_only follower, so it gets the same treatment here.
    const severeOnly = access.level === "follower" && access.shareLevel === "severe_only";
    const filterSevere = <T extends { severity: string }>(matchedAllergens: T[]): T[] =>
      severeOnly ? matchedAllergens.filter((m) => m.severity === "severe") : matchedAllergens;

    const history = rows.map(({ result, matched_allergens, ...row }) => {
      const corrections = correctionsByScanId.get(row.id) ?? [];
      const effective = applyUserCorrections({ result, matchedAllergens: matched_allergens }, corrections);
      return {
        ...row,
        original: { result, matched_allergens: filterSevere(matched_allergens) },
        effective: effective && { result: effective.result, matched_allergens: filterSevere(effective.matchedAllergens) },
        corrections,
      };
    });

    res.json(history);
  }),
);
