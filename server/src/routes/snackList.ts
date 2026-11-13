import { Router } from "express";

import { assertCanManageProfile, assertCanReadProfile } from "../authorization/profiles.js";
import { requireAuth } from "../auth/requireAuth.js";
import { publicCircleReports } from "../corrections/circleEscalations.js";
import { loadUserScanViews, publicCommunityReports } from "../corrections/userScanView.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import type { ProductForMatching, Verdict } from "../matcher/match.js";
import { loadProfileAllergens } from "../matcher/profileAllergens.js";
import { computeItemVerdict, type StoredScanDetail } from "../snackList/itemVerdict.js";
import { buildShopLinks } from "../snackList/shopLinks.js";

// Snack lists (docs/snack-list-plan.md, 2026-11-13). Per-route requireAuth, same reasoning as
// scansRouter: these paths share /profiles/:id with profilesRouter's own, so this router is mounted
// at bare /api and must not carry a router-level middleware.
export const snackListRouter = Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 200; // migration 0050's CHECK

// Kill switch: 404, not 403 — off looks like a feature that was never built, the posture every other
// switched route here uses (scans.ts's requireLabelScanEnabled). Items already saved stay put.
function requireSnackListEnabled(_req: unknown, _res: unknown, next: (err?: unknown) => void) {
  if (!env.snackList) {
    next(new HttpError(404, "not_found"));
    return;
  }
  next();
}

/** A short optional note: trimmed, empty is none, over the limit is a 400 rather than a database error. */
function parseNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new HttpError(400, "invalid_request");
  const note = raw.trim();
  if (note.length > NOTE_MAX) throw new HttpError(400, "note_too_long", { max: NOTE_MAX });
  return note === "" ? null : note;
}

type ItemRow = {
  id: string;
  barcode: string;
  scan_id: string | null;
  note: string | null;
  created_at: Date;
  added_by_name: string | null;
  found: boolean;
  name: string | null;
  brand: string | null;
  ingredients_text: string | null;
  allergens_tags: string[];
  traces_tags: string[];
  scan_matched_allergens: StoredScanDetail[] | null;
  scan_ingredients_text: string | null;
};

// Flagged items first (plan decision 4: an allergen added later flags the items it now catches, at
// the top of the list), then the list in the order it was built.
const HEADLINE_ORDER: Record<Verdict, number> = {
  contains_allergen: 0,
  may_contain_caution: 1,
  unable_to_confirm: 2,
  safe: 3,
};

snackListRouter.get(
  "/profiles/:id/snacks",
  requireAuth,
  requireSnackListEnabled,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const access = await assertCanReadProfile(req.user!.id, profileId);

    const { rows } = await pool.query<ItemRow>(
      `SELECT i.id, i.barcode, i.scan_id, i.note, i.created_at,
              u.display_name AS added_by_name,
              p.found, p.name, p.brand, p.ingredients_text, p.allergens_tags, p.traces_tags,
              s.matched_allergens AS scan_matched_allergens, s.ingredients_text AS scan_ingredients_text
       FROM snack_list_items i
       JOIN products p ON p.barcode = i.barcode
       LEFT JOIN scans s ON s.id = i.scan_id
       LEFT JOIN users u ON u.id = i.added_by
       WHERE i.allergen_profile_id = $1
       ORDER BY i.created_at ASC`,
      [profileId],
    );

    // The profile's full allergen list, as a scan uses: the check itself is never filtered by who's
    // asking (scans.ts); only what a severe_only follower is shown is, below.
    const allergens = await loadProfileAllergens(profileId);

    const computed = rows.map((row) => {
      const product: ProductForMatching = {
        found: row.found,
        allergensTags: row.allergens_tags,
        tracesTags: row.traces_tags,
        ingredientsText: row.ingredients_text,
      };
      const originating =
        row.scan_id && Array.isArray(row.scan_matched_allergens)
          ? { matchedAllergens: row.scan_matched_allergens, ingredientsText: row.scan_ingredients_text }
          : null;
      return { row, ...computeItemVerdict(allergens, product, originating) };
    });

    // The same layering as a scan's card, for this viewer: their own reports on the originating
    // scan, corroborated community additions on the barcode, the circle's pending reports. Keyed by
    // the originating scan so the viewer's own report on it applies; an item whose scan is gone is
    // keyed by its own id, which matches no correction, and still gets the barcode layers.
    const views = await loadUserScanViews(
      computed.map((c) => ({
        id: c.row.scan_id ?? c.row.id,
        barcode: c.row.barcode,
        result: c.verdict,
        matched_allergens: c.matchedAllergens,
      })),
      profileId,
      req.user!.id,
    );

    const severeOnly = access.level === "follower" && access.shareLevel === "severe_only";
    const filterSevere = <T extends { severity: string }>(details: T[]): T[] =>
      severeOnly ? details.filter((d) => d.severity === "severe") : details;

    const items = computed
      .map(({ row, verdict, matchedAllergens }) => {
        const view = views.get(row.scan_id ?? row.id)!;
        const headline = (view.effective?.result as Verdict | undefined) ?? verdict;
        const shownAllergens = view.effective ? filterSevere(view.effective.matchedAllergens) : [];
        const shownNames = new Set(shownAllergens.map((m) => m.allergenName.toLowerCase()));
        return {
          id: row.id,
          barcode: row.barcode,
          product: { name: row.name, brand: row.brand },
          note: row.note,
          // The approver is always a manager, whose name the circle already sees on the profile; so
          // unlike scan history's scanner (who may be another follower) it is shown to everyone here.
          added_by: row.added_by_name,
          created_at: row.created_at,
          scan_id: row.scan_id,
          original: { result: verdict, matched_allergens: filterSevere(matchedAllergens) },
          effective: view.effective && { result: view.effective.result, matched_allergens: shownAllergens },
          community_reports: publicCommunityReports(view.communityApplied.filter((a) => shownNames.has(a.allergenName.toLowerCase()))),
          pending_circle_reports: publicCircleReports(view.circleApplied.filter((a) => shownNames.has(a.allergenName.toLowerCase()))),
          // Omitted, not hidden, for a "Contains" item (plan decision 2): the client never receives
          // a link it must not show. Decided off the headline the card shows, layers included.
          shop:
            headline === "contains_allergen"
              ? null
              : buildShopLinks({ barcode: row.barcode, name: row.name, brand: row.brand }, { amazonAssociateTag: env.amazonAssociateTag }),
          headline,
        };
      })
      .sort((a, b) => HEADLINE_ORDER[a.headline] - HEADLINE_ORDER[b.headline] || a.created_at.getTime() - b.created_at.getTime());

    res.json({ items, affiliate: Boolean(env.amazonAssociateTag) });
  }),
);

// Items are added from a scan's verdict card only (plan decision 1): the body names the scan, and the
// barcode comes from the scan row, never from the client. Owner or co-manager (decision 5).
snackListRouter.post(
  "/profiles/:id/snacks",
  requireAuth,
  requireSnackListEnabled,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const { scanId } = req.body ?? {};
    if (typeof scanId !== "string" || !UUID_PATTERN.test(scanId)) throw new HttpError(400, "invalid_request");
    const note = parseNote(req.body?.note);
    await assertCanManageProfile(req.user!.id, profileId);

    const { rows: scans } = await pool.query<{ allergen_profile_id: string; barcode: string | null }>(
      "SELECT allergen_profile_id, barcode FROM scans WHERE id = $1",
      [scanId],
    );
    // A scan of another profile is as invisible as a missing one, like every other cross-profile read.
    if (!scans[0] || scans[0].allergen_profile_id !== profileId) throw new HttpError(404, "not_found");
    if (scans[0].barcode === null) throw new HttpError(400, "barcode_required");
    const barcode = scans[0].barcode;

    // A lookup that failed is never cached (lib/productLookup.ts), so a scan can exist with no product
    // row to list. Said as what it is rather than left to the foreign key.
    const { rows: products } = await pool.query("SELECT 1 FROM products WHERE barcode = $1", [barcode]);
    if (products.length === 0) throw new HttpError(409, "product_not_on_file");

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO snack_list_items (allergen_profile_id, barcode, scan_id, added_by, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (allergen_profile_id, barcode) DO NOTHING
       RETURNING id`,
      [profileId, barcode, scanId, req.user!.id, note],
    );
    if (!rows[0]) {
      const { rows: existing } = await pool.query<{ id: string }>(
        "SELECT id FROM snack_list_items WHERE allergen_profile_id = $1 AND barcode = $2",
        [profileId, barcode],
      );
      throw new HttpError(409, "already_listed", { id: existing[0]?.id });
    }
    res.status(201).json({ id: rows[0].id, barcode });
  }),
);

snackListRouter.patch(
  "/profiles/:id/snacks/:itemId",
  requireAuth,
  requireSnackListEnabled,
  asyncHandler(async (req, res) => {
    const { id: profileId, itemId } = req.params;
    if (!UUID_PATTERN.test(itemId)) throw new HttpError(404, "not_found");
    if (req.body?.note === undefined) throw new HttpError(400, "invalid_request");
    const note = parseNote(req.body.note);
    await assertCanManageProfile(req.user!.id, profileId);

    const { rows } = await pool.query<{ id: string; note: string | null }>(
      "UPDATE snack_list_items SET note = $3 WHERE id = $1 AND allergen_profile_id = $2 RETURNING id, note",
      [itemId, profileId, note],
    );
    if (!rows[0]) throw new HttpError(404, "not_found");
    res.json(rows[0]);
  }),
);

snackListRouter.delete(
  "/profiles/:id/snacks/:itemId",
  requireAuth,
  requireSnackListEnabled,
  asyncHandler(async (req, res) => {
    const { id: profileId, itemId } = req.params;
    if (!UUID_PATTERN.test(itemId)) throw new HttpError(404, "not_found");
    await assertCanManageProfile(req.user!.id, profileId);

    const { rowCount } = await pool.query("DELETE FROM snack_list_items WHERE id = $1 AND allergen_profile_id = $2", [itemId, profileId]);
    if (!rowCount) throw new HttpError(404, "not_found");
    res.status(204).end();
  }),
);
