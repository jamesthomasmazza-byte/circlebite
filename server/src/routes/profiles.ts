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
import { withActor } from "../lib/withActor.js";
import { choiceForKey, choicesForClient, OTHER_KEY, recognizeAllergenName } from "../matcher/allergenChoices.js";

// Mounted at /api/profiles (see app.ts) — every route below is relative to that, and every path
// here is deliberately WITHOUT a leading "/profiles" segment. requireAuth below is router-level
// (.use with no path, so it matches everything that enters this router); mounting narrowly at
// /api/profiles instead of bare /api is what keeps that blanket middleware from also intercepting
// unrelated routes like circleRouter's public GET /follow/:token, which happens to also live
// under /api. Express runs a router's .use() middleware before it even checks whether any of the
// router's own routes match, so scoping the mount prefix correctly is what does the actual work —
// not where the requireAuth call appears in this file.
export const profilesRouter = Router();
profilesRouter.use(requireAuth);

const SEVERITIES = ["mild", "moderate", "severe"] as const;
type Severity = (typeof SEVERITIES)[number];

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

type AllergenIdentity = { name: string; key: string };
type AllergenInput = AllergenIdentity & { severity: Severity; notes?: string; treatTracesAsUnsafe?: boolean };

/**
 * Which allergen a request names (allergenChoices.ts, 2026-10-23): a listed `key`, whose name is the
 * list's — never the client's — or `key: "other"` with a typed `name`. Free text for something on the
 * list is refused with the listed allergen it is, so "treenuts" can't reach a profile again: as
 * Other it would match only that word (match.ts), and the Oct 16 chewy bar's almonds went unflagged.
 */
function resolveAllergenIdentity(key: unknown, name: unknown): AllergenIdentity {
  if (typeof key !== "string") throw new HttpError(400, "invalid_request");
  if (key !== OTHER_KEY) {
    const choice = choiceForKey(key);
    if (!choice) throw new HttpError(400, "invalid_request");
    return { name: choice.displayName, key };
  }
  if (typeof name !== "string" || name.trim().length === 0) throw new HttpError(400, "invalid_request");
  refuseListedName(name);
  return { name: name.trim(), key: OTHER_KEY };
}

/** 409 naming the listed allergen a typed name already is, so the client can offer it instead. */
function refuseListedName(name: string): void {
  const recognized = recognizeAllergenName(name);
  if (!recognized) return;
  const choice = choiceForKey(recognized.key)!;
  throw new HttpError(409, "listed_allergen", { key: choice.key, displayName: choice.displayName });
}

function parseAllergenInput(raw: unknown): AllergenInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { key, name, severity, notes, treatTracesAsUnsafe } = raw as Record<string, unknown>;
  if (!isSeverity(severity)) return null;
  if (notes !== undefined && typeof notes !== "string") return null;
  if (treatTracesAsUnsafe !== undefined && typeof treatTracesAsUnsafe !== "boolean") return null;
  return { ...resolveAllergenIdentity(key, name), severity, notes, treatTracesAsUnsafe };
}

const ALLERGEN_COLUMNS = "id, name, severity, notes, treat_traces_as_unsafe, allergen_key, key_needs_review";

// Which allergens a severe_only follower is shown when browsing a profile: the profile page and the
// names on the profile list. Never the live scan, which checks the full list (scans.ts).
const SEVERE_ONLY_ALLERGENS = "severity = 'severe'";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// ---- Profiles ----

profilesRouter.post(
  "/",
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

    try {
      const created = await withActor(req.user!.id, async (client) => {
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
            `INSERT INTO allergens (allergen_profile_id, name, severity, notes, treat_traces_as_unsafe, allergen_key)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING ${ALLERGEN_COLUMNS}`,
            [
              profile.id,
              a.name,
              a.severity,
              a.notes ?? null,
              a.treatTracesAsUnsafe ?? profile.default_treat_traces_as_unsafe,
              a.key,
            ],
          );
          createdAllergens.push(rows[0]);
        }
        return { ...profile, allergens: createdAllergens };
      });
      res.status(201).json(created);
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, "duplicate_allergen");
      throw err;
    }
  }),
);

profilesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    // allergens_needing_review: allergens a manager has to look at (migration 0046) — the dashboard
    // says so until they do. Managers only; a follower can't decide, so isn't asked.
    // allergen_names: the line under each name that tells two same-named profiles apart (Scan's
    // "Scanning for", the Profile tab). Names only — never severity or notes.
    const { rows: managed } = await pool.query(
      `SELECT p.id, p.label, p.is_self,
              CASE WHEN p.manager_id = $1 THEN 'owner' ELSE 'co_manager' END AS relationship,
              ARRAY(SELECT name FROM allergens a WHERE a.allergen_profile_id = p.id ORDER BY name) AS allergen_names,
              (SELECT count(*)::int FROM allergens a WHERE a.allergen_profile_id = p.id AND a.key_needs_review)
                AS allergens_needing_review
       FROM allergen_profiles p
       LEFT JOIN profile_managers pm ON pm.allergen_profile_id = p.id AND pm.user_id = $1
       WHERE p.manager_id = $1 OR pm.user_id = $1
       ORDER BY p.created_at`,
      [userId],
    );

    const { rows: followed } = await pool.query(
      `SELECT p.id, p.label, p.is_self, f.share_level,
              ARRAY(SELECT name FROM allergens a
                    WHERE a.allergen_profile_id = p.id
                      AND (f.share_level <> 'severe_only' OR ${SEVERE_ONLY_ALLERGENS})
                    ORDER BY name) AS allergen_names
       FROM allergen_profiles p
       JOIN follow_relationships f ON f.allergen_profile_id = p.id
       WHERE f.follower_id = $1 AND f.status = 'accepted'
       ORDER BY p.created_at`,
      [userId],
    );

    res.json({ managed, followed });
  }),
);

// The list a profile's allergens are picked from. Before "/:id", which would otherwise take
// "allergen-choices" for a profile id.
profilesRouter.get(
  "/allergen-choices",
  asyncHandler(async (_req, res) => {
    res.json({ choices: choicesForClient() });
  }),
);

profilesRouter.get(
  "/:id",
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
        ? `SELECT ${ALLERGEN_COLUMNS} FROM allergens WHERE allergen_profile_id = $1 AND ${SEVERE_ONLY_ALLERGENS} ORDER BY name`
        : `SELECT ${ALLERGEN_COLUMNS} FROM allergens WHERE allergen_profile_id = $1 ORDER BY name`,
      [profileId],
    );

    res.json({ ...profile, allergens, access });
  }),
);

profilesRouter.patch(
  "/:id",
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

    const { rows } = await withActor(req.user!.id, (client) => client.query(
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
    ));
    res.json(rows[0]);
  }),
);

profilesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertIsProfileOwner(req.user!.id, profileId);
    await pool.query("DELETE FROM allergen_profiles WHERE id = $1", [profileId]);
    res.status(204).end();
  }),
);

// ---- Allergens (sub-resource) ----

profilesRouter.post(
  "/:id/allergens",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertCanManageProfile(req.user!.id, profileId);

    const parsed = parseAllergenInput(req.body);
    if (!parsed) throw new HttpError(400, "invalid_request");

    try {
      const { rows } = await withActor(req.user!.id, (client) => client.query(
        `INSERT INTO allergens (allergen_profile_id, name, severity, notes, treat_traces_as_unsafe, allergen_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${ALLERGEN_COLUMNS}`,
        [
          profileId,
          parsed.name,
          parsed.severity,
          parsed.notes ?? null,
          parsed.treatTracesAsUnsafe ?? true,
          parsed.key,
        ],
      ));
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, "duplicate_allergen");
      throw err;
    }
  }),
);

profilesRouter.patch(
  "/:id/allergens/:allergenId",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const allergenId = req.params.allergenId;
    await assertCanManageProfile(req.user!.id, profileId);

    const { key, name, severity, notes, treatTracesAsUnsafe } = req.body ?? {};
    // A name changes only with a key: a listed allergen's name is the list's, and Other's is
    // re-checked against the list (resolveAllergenIdentity). keepName: "Keep it as typed" on an
    // allergen the list doesn't have — key "other", no new name (checked against the stored one below).
    if (name !== undefined && key === undefined) throw new HttpError(400, "invalid_request");
    const keepName = key === OTHER_KEY && name === undefined;
    const identity = key === undefined || keepName ? null : resolveAllergenIdentity(key, name);
    if (severity !== undefined && !isSeverity(severity)) throw new HttpError(400, "invalid_request");
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      throw new HttpError(400, "invalid_request");
    }
    if (treatTracesAsUnsafe !== undefined && typeof treatTracesAsUnsafe !== "boolean") {
      throw new HttpError(400, "invalid_request");
    }

    if (keepName) {
      const { rows: current } = await pool.query<{ name: string }>(
        "SELECT name FROM allergens WHERE id = $1 AND allergen_profile_id = $2",
        [allergenId, profileId],
      );
      if (current.length === 0) throw new HttpError(404, "not_found");
      // "treenuts" kept as typed would drop the tree-nut key and its almonds: offer the list's instead.
      refuseListedName(current[0]!.name);
    }

    try {
      // The WHERE clause checks allergen_profile_id too, not just id — assertCanManageProfile
      // only proves the caller can manage the profile named in the URL, not that :allergenId
      // actually belongs to it. A key ($8) is a manager's choice, so it settles the review flag; a
      // rename it brings is an ordinary edit, logged by the trigger with this actor (0036/0041).
      const { rows } = await withActor(req.user!.id, (client) => client.query(
        `UPDATE allergens
         SET name = COALESCE($3, name),
             severity = COALESCE($4, severity),
             notes = CASE WHEN $5::boolean THEN $6 ELSE notes END,
             treat_traces_as_unsafe = COALESCE($7, treat_traces_as_unsafe),
             allergen_key = COALESCE($8, allergen_key),
             key_needs_review = CASE WHEN $8 IS NULL THEN key_needs_review ELSE false END,
             updated_at = now()
         WHERE id = $1 AND allergen_profile_id = $2
         RETURNING ${ALLERGEN_COLUMNS}`,
        [
          allergenId,
          profileId,
          identity?.name ?? null,
          severity ?? null,
          notes !== undefined,
          notes ?? null,
          treatTracesAsUnsafe ?? null,
          identity?.key ?? (keepName ? OTHER_KEY : null),
        ],
      ));
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
  "/:id/allergens/:allergenId",
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    const allergenId = req.params.allergenId;
    await assertCanManageProfile(req.user!.id, profileId);

    const { rowCount } = await withActor(req.user!.id, (client) =>
      client.query("DELETE FROM allergens WHERE id = $1 AND allergen_profile_id = $2", [allergenId, profileId]),
    );
    if (rowCount === 0) throw new HttpError(404, "not_found");
    res.status(204).end();
  }),
);
