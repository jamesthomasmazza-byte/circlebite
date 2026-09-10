import { Router } from "express";

import { assertCanReadProfile } from "../authorization/profiles.js";
import { requireAuth } from "../auth/requireAuth.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { getProduct } from "../lib/productLookup.js";
import { computeVerdict, type AllergenVerdictDetail, type ProfileAllergen, type Severity } from "../matcher/match.js";

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
    const { verdict, matchedAllergens } = computeVerdict(allergens, product);

    const { rows } = await pool.query(
      `INSERT INTO scans
         (scanner_id, allergen_profile_id, barcode, product_name, product_brand, ingredients_text,
          product_data, product_last_updated, result, matched_allergens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, barcode, product_name, product_brand, ingredients_text, product_last_updated,
                 result, matched_allergens, created_at`,
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
      ],
    );

    // Full detail, unfiltered — this is the live, active-decision response, not history. See the
    // GET handler below for why history gets the opposite treatment.
    res.status(201).json(rows[0]);
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

    // Unlike the live scan result, history is browsing at leisure, not an active safety decision
    // — the same category of access the profile page's own severity filtering already applies to
    // a severe_only follower, so it gets the same treatment here.
    const severeOnly = access.level === "follower" && access.shareLevel === "severe_only";
    const history = severeOnly
      ? rows.map((row) => ({
          ...row,
          matched_allergens: (row.matched_allergens as AllergenVerdictDetail[]).filter(
            (m) => m.severity === "severe",
          ),
        }))
      : rows;

    res.json(history);
  }),
);
