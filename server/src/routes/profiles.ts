import { Router } from "express";

import {
  assertCanManageProfile,
  assertCanReadProfile,
  assertIsProfileOwner,
} from "../authorization/profiles.js";
import { requireAuth } from "../auth/requireAuth.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";

export const profilesRouter = Router();
profilesRouter.use(requireAuth);

const SEVERITIES = ["mild", "moderate", "severe"] as const;
type Severity = (typeof SEVERITIES)[number];

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

type AllergenInput = { name: string; severity: Severity; notes?: string; treatTracesAsUnsafe?: boolean };

function parseAllergenInput(raw: unknown): AllergenInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { name, severity, notes, treatTracesAsUnsafe } = raw as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  if (!isSeverity(severity)) return null;
  if (notes !== undefined && typeof notes !== "string") return null;
  if (treatTracesAsUnsafe !== undefined && typeof treatTracesAsUnsafe !== "boolean") return null;
  return { name: name.trim(), severity, notes, treatTracesAsUnsafe };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// ---- Profiles ----

profilesRouter.post(
  "/profiles",
  asyncHandler(async (req, res) => {
    const { label, isSelf, notes, allergens } = req.body ?? {};

    if (typeof label !== "string" || label.trim().length === 0) {
      throw new HttpError(400, "invalid_request");
    }
    if (isSelf !== undefined && typeof isSelf !== "boolean") throw new HttpError(400, "invalid_request");
    if (notes !== undefined && typeof notes !== "string") throw new HttpError(400, "invalid_request");

    let allergenInputs: AllergenInput[] = [];
    if (allergens !== undefined) {
      if (!Array.isArray(allergens)) throw new HttpError(400, "invalid_request");
      const parsed = allergens.map(parseAllergenInput);
      if (parsed.some((a) => a === null)) throw new HttpError(400, "invalid_request");
      allergenInputs = parsed as AllergenInput[];
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: profileRows } = await client.query<{
        id: string;
        label: string;
        is_self: boolean;
        notes: string | null;
        default_treat_traces_as_unsafe: boolean;
      }>(
        `INSERT INTO allergen_profiles (manager_id, label, is_self, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id, label, is_self, notes, default_treat_traces_as_unsafe`,
        [req.user!.id, label.trim(), isSelf ?? false, notes ?? null],
      );
      const profile = profileRows[0]!;

      const createdAllergens = [];
      for (const a of allergenInputs) {
        const { rows } = await client.query(
          `INSERT INTO allergens (allergen_profile_id, name, severity, notes, treat_traces_as_unsafe)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, severity, notes, treat_traces_as_unsafe`,
          [
            profile.id,
            a.name,
            a.severity,
            a.notes ?? null,
            a.treatTracesAsUnsafe ?? profile.default_treat_traces_as_unsafe,
          ],
        );
        createdAllergens.push(rows[0]);
      }

      await client.query("COMMIT");
      res.status(201).json({ ...profile, allergens: createdAllergens });
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(err)) throw new HttpError(409, "duplicate_allergen");
      throw err;
    } finally {
      client.release();
    }
  }),
);

profilesRouter.get(
  "/profiles",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const { rows: managed } = await pool.query(
      `SELECT p.id, p.label, p.is_self,
              CASE WHEN p.manager_id = $1 THEN 'owner' ELSE 'co_manager' END AS relationship
       FROM allergen_profiles p
       LEFT JOIN profile_managers pm ON pm.allergen_profile_id = p.id AND pm.user_id = $1
       WHERE p.manager_id = $1 OR pm.user_id = $1
       ORDER BY p.created_at`,
      [userId],
    );

    const { rows: followed } = await pool.query(
      `SELECT p.id, p.label, p.is_self, f.share_level
       FROM allergen_profiles p
       JOIN follow_relationships f ON f.allergen_profile_id = p.id
       WHERE f.follower_id = $1 AND f.status = 'accepted'
       ORDER BY p.created_at`,
      [userId],
    );

    res.json({ managed, followed });
  }),
);

profilesRouter.get(
  "/profiles/:id",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const access = await assertCanReadProfile(req.user!.id, profileId);

    const { rows: profileRows } = await pool.query(
      "SELECT id, label, is_self, notes, default_treat_traces_as_unsafe FROM allergen_profiles WHERE id = $1",
      [profileId],
    );
    const profile = profileRows[0];
    if (!profile) throw new HttpError(404, "not_found");

    const severeOnly = access.level === "follower" && access.shareLevel === "severe_only";
    const { rows: allergens } = await pool.query(
      severeOnly
        ? "SELECT id, name, severity, notes, treat_traces_as_unsafe FROM allergens WHERE allergen_profile_id = $1 AND severity = 'severe' ORDER BY name"
        : "SELECT id, name, severity, notes, treat_traces_as_unsafe FROM allergens WHERE allergen_profile_id = $1 ORDER BY name",
      [profileId],
    );

    res.json({ ...profile, allergens, access });
  }),
);

profilesRouter.patch(
  "/profiles/:id",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertCanManageProfile(req.user!.id, profileId);

    const { label, notes, defaultTreatTracesAsUnsafe } = req.body ?? {};
    if (label !== undefined && (typeof label !== "string" || label.trim().length === 0)) {
      throw new HttpError(400, "invalid_request");
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      throw new HttpError(400, "invalid_request");
    }
    if (defaultTreatTracesAsUnsafe !== undefined && typeof defaultTreatTracesAsUnsafe !== "boolean") {
      throw new HttpError(400, "invalid_request");
    }

    const { rows } = await pool.query(
      `UPDATE allergen_profiles
       SET label = COALESCE($2, label),
           notes = CASE WHEN $3::boolean THEN $4 ELSE notes END,
           default_treat_traces_as_unsafe = COALESCE($5, default_treat_traces_as_unsafe),
           updated_at = now()
       WHERE id = $1
       RETURNING id, label, is_self, notes, default_treat_traces_as_unsafe`,
      [
        profileId,
        label !== undefined ? label.trim() : null,
        notes !== undefined,
        notes ?? null,
        defaultTreatTracesAsUnsafe ?? null,
      ],
    );
    res.json(rows[0]);
  }),
);

profilesRouter.delete(
  "/profiles/:id",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertIsProfileOwner(req.user!.id, profileId);
    await pool.query("DELETE FROM allergen_profiles WHERE id = $1", [profileId]);
    res.status(204).end();
  }),
);

// ---- Allergens (sub-resource) ----

profilesRouter.post(
  "/profiles/:id/allergens",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertCanManageProfile(req.user!.id, profileId);

    const parsed = parseAllergenInput(req.body);
    if (!parsed) throw new HttpError(400, "invalid_request");

    try {
      const { rows } = await pool.query(
        `INSERT INTO allergens (allergen_profile_id, name, severity, notes, treat_traces_as_unsafe)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, severity, notes, treat_traces_as_unsafe`,
        [
          profileId,
          parsed.name,
          parsed.severity,
          parsed.notes ?? null,
          parsed.treatTracesAsUnsafe ?? true,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, "duplicate_allergen");
      throw err;
    }
  }),
);

profilesRouter.patch(
  "/profiles/:id/allergens/:allergenId",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const allergenId = req.params.allergenId;
    await assertCanManageProfile(req.user!.id, profileId);

    const { name, severity, notes, treatTracesAsUnsafe } = req.body ?? {};
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      throw new HttpError(400, "invalid_request");
    }
    if (severity !== undefined && !isSeverity(severity)) throw new HttpError(400, "invalid_request");
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      throw new HttpError(400, "invalid_request");
    }
    if (treatTracesAsUnsafe !== undefined && typeof treatTracesAsUnsafe !== "boolean") {
      throw new HttpError(400, "invalid_request");
    }

    try {
      // The WHERE clause checks allergen_profile_id too, not just id — assertCanManageProfile
      // only proves the caller can manage the profile named in the URL, not that :allergenId
      // actually belongs to it.
      const { rows } = await pool.query(
        `UPDATE allergens
         SET name = COALESCE($3, name),
             severity = COALESCE($4, severity),
             notes = CASE WHEN $5::boolean THEN $6 ELSE notes END,
             treat_traces_as_unsafe = COALESCE($7, treat_traces_as_unsafe),
             updated_at = now()
         WHERE id = $1 AND allergen_profile_id = $2
         RETURNING id, name, severity, notes, treat_traces_as_unsafe`,
        [
          allergenId,
          profileId,
          name !== undefined ? name.trim() : null,
          severity ?? null,
          notes !== undefined,
          notes ?? null,
          treatTracesAsUnsafe ?? null,
        ],
      );
      if (rows.length === 0) throw new HttpError(404, "not_found");
      res.json(rows[0]);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (isUniqueViolation(err)) throw new HttpError(409, "duplicate_allergen");
      throw err;
    }
  }),
);

profilesRouter.delete(
  "/profiles/:id/allergens/:allergenId",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const allergenId = req.params.allergenId;
    await assertCanManageProfile(req.user!.id, profileId);

    const { rowCount } = await pool.query(
      "DELETE FROM allergens WHERE id = $1 AND allergen_profile_id = $2",
      [allergenId, profileId],
    );
    if (rowCount === 0) throw new HttpError(404, "not_found");
    res.status(204).end();
  }),
);
