import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PoolClient } from "pg";

import { env } from "../../env.js";
import { SEED_PRODUCT_MARKER } from "../../lib/productLookup.js";
import { SEED_EMAIL_DOMAIN } from "../../lib/seedMarker.js";
import { computeVerdict } from "../../matcher/match.js";
import { pool } from "../pool.js";
import {
  CO_MANAGERS,
  COMMUNITY_REPORT,
  FOLLOWERS,
  NPS_ROWS,
  PEOPLE,
  PLACEHOLDER_PHOTO_PNG,
  PRODUCTS,
  PROFILES,
  SCANS,
  SEED_BARCODES,
} from "./seedData.js";

// The judge seed: invented families, every circle role, scan history, one community report, and the
// NPS rows — rerunnable and idempotent. It finds its own rows by ONE marker, the reserved seed
// email domain (lib/seedMarker.ts; signup refuses it), plus the fixed ids and barcodes in
// seedData.ts. It never selects anything by guessing.
//
// What a reseed does, in one transaction (a failure anywhere leaves the database as it was):
//   1. Guard. Non-seeded people's rows ON seeded profiles — a real person a judge invited as
//      co-manager or follower, or their scans of a seeded child — would be cascaded away by step 4.
//      By default that aborts with counts, for a human to look at first. With `force`, those rows are
//      removed explicitly (they are about synthetic children only). Never a non-seeded person's own
//      account, their own profiles, or their scans of them.
//   2. Corrections a seeded account filed (the judge's own test reports — possibly on real products,
//      live for real families) are REJECTED, not deleted, with a fixed reason: the same mechanism as a
//      review-queue reject, and the overrule log stays intact (docs/coppa.md §2.7 keeps corrections
//      out of deletion for the same reason).
//   3. The seed's own correction and NPS rows, and NPS responses a seeded account filed, are deleted.
//   4. Every seeded account is deleted; profiles, allergens, circle edges, scans and sessions cascade.
//   5. Everything is created fresh from seedData.ts.
//
// Known limit: if the judge deleted the account before a reseed, their reports are already anonymous
// (reported_by SET NULL) and no marker can find them — BACKLOG's judging-week checklist covers it.

export const JUDGE_CORRECTION_REJECTION_REASON = "Judge test data — cleared by reseed";

export type SeedConflicts = {
  /** Non-seeded people who co-manage a seeded account's profile. */
  coManagers: number;
  /** Non-seeded people who follow (or were invited to follow) a seeded account's profile. */
  followers: number;
  /** Scans of a seeded account's profile made by a non-seeded person. */
  scans: number;
  /** `products` rows on a seed barcode that the seed didn't write (an earlier real scan cached a
   *  not-found for it). Overwritten under force — it's a cache row, not anybody's data. */
  products: number;
};

export class SeedConflictError extends Error {
  constructor(public readonly conflicts: SeedConflicts) {
    super("seeded profiles have non-seeded people or rows attached — rerun with --force to remove them");
  }
}

export type SeedSummary = {
  forcedRemovals: SeedConflicts | null;
  judgeCorrectionsRejected: number;
  accounts: number;
  profiles: number;
  scans: number;
  npsRows: number;
};

function hasConflicts(c: SeedConflicts): boolean {
  return c.coManagers + c.followers + c.scans + c.products > 0;
}

async function findConflicts(client: PoolClient, seededUserIds: string[]): Promise<SeedConflicts> {
  const count = async (sql: string, params: unknown[]) => Number((await client.query<{ n: string }>(sql, params)).rows[0].n);
  const seededProfiles = `SELECT id FROM allergen_profiles WHERE manager_id = ANY($1)`;
  return {
    coManagers: await count(
      `SELECT count(*) AS n FROM profile_managers WHERE allergen_profile_id IN (${seededProfiles}) AND NOT (user_id = ANY($1))`,
      [seededUserIds],
    ),
    followers: await count(
      `SELECT count(*) AS n FROM follow_relationships
       WHERE allergen_profile_id IN (${seededProfiles}) AND follower_id IS NOT NULL AND NOT (follower_id = ANY($1))`,
      [seededUserIds],
    ),
    scans: await count(
      `SELECT count(*) AS n FROM scans
       WHERE allergen_profile_id IN (${seededProfiles}) AND scanner_id IS NOT NULL AND NOT (scanner_id = ANY($1))`,
      [seededUserIds],
    ),
    products: await count(
      `SELECT count(*) AS n FROM products
       WHERE barcode = ANY($1) AND (raw_data IS NULL OR raw_data->>'${SEED_PRODUCT_MARKER}' IS DISTINCT FROM 'true')`,
      [SEED_BARCODES],
    ),
  };
}

async function removeConflicts(client: PoolClient, seededUserIds: string[]): Promise<void> {
  const seededProfiles = `SELECT id FROM allergen_profiles WHERE manager_id = ANY($1)`;
  await client.query(
    `DELETE FROM profile_managers WHERE allergen_profile_id IN (${seededProfiles}) AND NOT (user_id = ANY($1))`,
    [seededUserIds],
  );
  await client.query(
    `DELETE FROM follow_relationships
     WHERE allergen_profile_id IN (${seededProfiles}) AND follower_id IS NOT NULL AND NOT (follower_id = ANY($1))`,
    [seededUserIds],
  );
  await client.query(
    `DELETE FROM scans
     WHERE allergen_profile_id IN (${seededProfiles}) AND scanner_id IS NOT NULL AND NOT (scanner_id = ANY($1))`,
    [seededUserIds],
  );
  // Non-seed products rows on seed barcodes are overwritten by the upsert in createSeed.
}

/**
 * Clears and recreates the seed inside the caller's transaction. Throws SeedConflictError (before
 * changing anything) when the guard finds non-seeded rows on seeded profiles and `force` is off.
 */
export async function seedJudge(
  client: PoolClient,
  options: { judgePasswordHash: string; otherPasswordHash: string; force: boolean },
): Promise<SeedSummary> {
  const { rows: seededUsers } = await client.query<{ id: string }>("SELECT id FROM users WHERE email LIKE $1", [
    `%@${SEED_EMAIL_DOMAIN}`,
  ]);
  const seededUserIds = seededUsers.map((u) => u.id);

  // 1. Guard.
  const conflicts = await findConflicts(client, seededUserIds);
  if (hasConflicts(conflicts)) {
    if (!options.force) throw new SeedConflictError(conflicts);
    await removeConflicts(client, seededUserIds);
  }

  // 2. The judge's own reports: rejected, never deleted.
  const { rowCount: judgeCorrectionsRejected } = await client.query(
    `UPDATE product_corrections
       SET status = 'rejected', rejected_by = NULL, rejected_at = now(), rejection_reason = $3
     WHERE reported_by = ANY($1) AND status <> 'rejected' AND id <> $2`,
    [seededUserIds, COMMUNITY_REPORT.id, JUDGE_CORRECTION_REJECTION_REASON],
  );

  // 3. The seed's own correction and NPS rows, and seeded accounts' NPS responses.
  await client.query("DELETE FROM product_corrections WHERE id = $1", [COMMUNITY_REPORT.id]);
  await client.query("DELETE FROM nps_responses WHERE id = ANY($1) OR user_id = ANY($2)", [
    NPS_ROWS.map((r) => r.id),
    seededUserIds,
  ]);

  // 4. Every seeded account; their profiles, circle edges, scans and sessions cascade.
  //
  // First, the two ON DELETE SET NULLs that would reach product_corrections — reported_by (from the
  // user) and scan_id (from a seeded child's scan) — applied explicitly, with exactly the result the
  // cascade would have had. Left to the cascade, a correction step 2 just rejected fails: it was
  // updated in this transaction, so Postgres re-checks its foreign keys on the reported_by cascade,
  // and by then its scan has already been deleted while scan_id still points at it.
  await client.query("UPDATE product_corrections SET reported_by = NULL WHERE reported_by = ANY($1)", [seededUserIds]);
  await client.query(
    `UPDATE product_corrections SET scan_id = NULL
     WHERE scan_id IN (SELECT s.id FROM scans s JOIN allergen_profiles p ON p.id = s.allergen_profile_id WHERE p.manager_id = ANY($1))`,
    [seededUserIds],
  );
  await client.query("DELETE FROM users WHERE id = ANY($1)", [seededUserIds]);

  // 5. Fresh.
  await createSeed(client, options);

  return {
    forcedRemovals: hasConflicts(conflicts) ? conflicts : null,
    judgeCorrectionsRejected: judgeCorrectionsRejected ?? 0,
    accounts: Object.keys(PEOPLE).length,
    profiles: Object.keys(PROFILES).length,
    scans: SCANS.length,
    npsRows: NPS_ROWS.length,
  };
}

async function createSeed(client: PoolClient, options: { judgePasswordHash: string; otherPasswordHash: string }) {
  for (const [key, person] of Object.entries(PEOPLE)) {
    // Only the judge can sign in. The other three get an unusable hash of random bytes nobody ever
    // sees — they exist to be the judge's circle, not to be logged into.
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at, is_admin)
       VALUES ($1, $2, $3, $4, true, now(), false)`,
      [person.id, person.email, key === "judge" ? options.judgePasswordHash : options.otherPasswordHash, person.displayName],
    );
  }

  for (const profile of Object.values(PROFILES)) {
    await client.query(
      "INSERT INTO allergen_profiles (id, manager_id, label, is_self) VALUES ($1, $2, $3, false)",
      [profile.id, PEOPLE[profile.owner].id, profile.label],
    );
    for (const a of profile.allergens) {
      await client.query(
        `INSERT INTO allergens (id, allergen_profile_id, name, severity, treat_traces_as_unsafe)
         VALUES ($1, $2, $3, $4, $5)`,
        [a.id, profile.id, a.name, a.severity, a.treatTracesAsUnsafe],
      );
    }
  }

  for (const m of CO_MANAGERS) {
    await client.query(
      "INSERT INTO profile_managers (id, allergen_profile_id, user_id, added_by) VALUES ($1, $2, $3, $4)",
      [m.id, PROFILES[m.profile].id, PEOPLE[m.person].id, PEOPLE[m.addedBy].id],
    );
  }
  for (const f of FOLLOWERS) {
    // token_hash only has to be unique; nobody holds a token for an already-accepted seeded follow.
    await client.query(
      `INSERT INTO follow_relationships
         (id, allergen_profile_id, follower_id, invited_by, token_hash, status, share_level, responded_at)
       VALUES ($1, $2, $3, $4, $5, 'accepted', $6, now())`,
      [f.id, PROFILES[f.profile].id, PEOPLE[f.person].id, PEOPLE[f.invitedBy].id, `seed-follow-${f.id}`, f.shareLevel],
    );
  }

  for (const product of Object.values(PRODUCTS)) {
    // Marked, so getProduct never refreshes it from Open Food Facts (lib/productLookup.ts).
    await client.query(
      `INSERT INTO products (barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (barcode) DO UPDATE SET
         found = EXCLUDED.found, name = EXCLUDED.name, brand = EXCLUDED.brand,
         ingredients_text = EXCLUDED.ingredients_text, allergens_tags = EXCLUDED.allergens_tags,
         traces_tags = EXCLUDED.traces_tags, raw_data = EXCLUDED.raw_data,
         product_last_updated = NULL, fetched_at = now()`,
      [
        product.barcode,
        product.found,
        product.name,
        product.brand,
        product.ingredientsText,
        product.allergensTags,
        product.tracesTags,
        JSON.stringify({ [SEED_PRODUCT_MARKER]: true }),
      ],
    );
  }

  for (const scan of SCANS) {
    const product = PRODUCTS[scan.product];
    const profile = PROFILES[scan.profile];
    // The real matcher, over the same product record a rescan will read — history and a rescan can't
    // disagree. No AI: every found product has structured tags, so a live scan wouldn't call it either.
    const { verdict, matchedAllergens } = computeVerdict(
      profile.allergens.map((a) => ({ name: a.name, severity: a.severity, treatTracesAsUnsafe: a.treatTracesAsUnsafe })),
      product,
    );
    await client.query(
      `INSERT INTO scans
         (id, scanner_id, allergen_profile_id, barcode, product_name, product_brand, ingredients_text,
          product_data, result, matched_allergens, source, community_corrections_applied, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'barcode', '[]', now() - make_interval(days => $11))`,
      [
        scan.id,
        PEOPLE[scan.scanner].id,
        profile.id,
        product.barcode,
        product.name,
        product.brand,
        product.ingredientsText,
        JSON.stringify({ [SEED_PRODUCT_MARKER]: true }),
        verdict,
        JSON.stringify(matchedAllergens),
        scan.daysAgo,
      ],
    );
  }

  // Corroborated on its first report, as any add_caution is (threshold 1, recordCorrection.ts).
  const reportedScan = SCANS.find((s) => s.id === COMMUNITY_REPORT.scan)!;
  await client.query(
    `INSERT INTO product_corrections
       (id, scan_id, barcode, reported_by, correction_type, direction, allergen, target,
        verdict_at_report, note, photo_path, status, origin, created_at)
     VALUES ($1, $2, $3, $4, 'flag_missing', 'add_caution', $5, 'off_data', 'unable_to_confirm', $6, $7,
             'corroborated', 'user_initiated', now() - make_interval(days => $8))`,
    [
      COMMUNITY_REPORT.id,
      COMMUNITY_REPORT.scan,
      PRODUCTS[COMMUNITY_REPORT.product].barcode,
      PEOPLE[COMMUNITY_REPORT.reporter].id,
      COMMUNITY_REPORT.allergen,
      COMMUNITY_REPORT.note,
      COMMUNITY_REPORT.photoPath,
      reportedScan.daysAgo,
    ],
  );

  for (const row of NPS_ROWS) {
    await client.query("INSERT INTO nps_responses (id, user_id, score, reason, source) VALUES ($1, NULL, $2, $3, 'seed')", [
      row.id,
      row.score,
      row.reason,
    ]);
  }
}

/** Writes (overwrites) the seeded report's placeholder photo. Called after the transaction commits. */
export async function writeSeedPhoto(): Promise<void> {
  const fullPath = path.join(env.uploadDir, COMMUNITY_REPORT.photoPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, PLACEHOLDER_PHOTO_PNG);
}

/** The whole run in one transaction, then the photo. Used by the CLI (seedJudge.ts) and the tests. */
export async function runJudgeSeed(options: {
  judgePasswordHash: string;
  otherPasswordHash: string;
  force: boolean;
}): Promise<SeedSummary> {
  const client = await pool.connect();
  let summary: SeedSummary;
  try {
    await client.query("BEGIN");
    summary = await seedJudge(client, options);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await writeSeedPhoto();
  return summary;
}
