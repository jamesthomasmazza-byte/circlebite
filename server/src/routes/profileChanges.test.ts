import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { createApp } from "../app.js";
import { createSession, SESSION_COOKIE_NAME } from "../auth/session.js";
import { deletePhoto, resolvePhotoPath } from "../corrections/photoStorage.js";
import { pool } from "../db/pool.js";
import { withActor } from "../lib/withActor.js";

// Over real HTTP through createApp(), not by calling handlers off the router like the other route
// tests: what these prove includes that the router is mounted, behind real auth, at the paths the
// client will call. A router that exists but isn't registered passes every handler-level test.

const OWNER = randomUUID();
const CO_MANAGER = randomUUID();
const FOLLOWER = randomUUID();
const EMAILS = [OWNER, CO_MANAGER, FOLLOWER].map((id) => `${id}@example.test`);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

let server: Server;
let baseUrl: string;
let profileId: string;
let photoPath: string;
const cookies = new Map<string, string>();
const correctionsToClean: string[] = [];

async function request(userId: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (userId) headers.cookie = `${SESSION_COOKIE_NAME}=${cookies.get(userId)}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get("content-type"), text, json: () => JSON.parse(text) };
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $4, 'x', 'Owner Ada', true, now()), ($2, $5, 'x', 'Co Sam', true, now()), ($3, $6, 'x', 'Follower Fay', true, now())`,
    [OWNER, CO_MANAGER, FOLLOWER, ...EMAILS],
  );
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO allergen_profiles (manager_id, label) VALUES ($1, 'Test Child') RETURNING id",
    [OWNER],
  );
  profileId = rows[0]!.id;
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profileId, CO_MANAGER]);
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, token_hash, status, share_level)
     VALUES ($1, $2, $3, 'accepted', 'severe_only')`,
    [profileId, FOLLOWER, `profile-changes-test-${randomUUID()}`],
  );

  // The owner adds Peanut; the co-manager removes it and files a downgrade with a real photo on disk.
  await withActor(OWNER, (c) =>
    c.query("INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, 'Peanut', 'mild', true)", [profileId]),
  );
  await withActor(CO_MANAGER, (c) => c.query("DELETE FROM allergens WHERE allergen_profile_id = $1", [profileId]));
  // Its own directory under UPLOAD_DIR, not savePhotoBuffer's corrections/: test files run
  // concurrently, and corrections.test.ts snapshots corrections/ to prove a refused report leaves
  // no file behind — a photo of ours appearing there mid-snapshot fails it.
  photoPath = path.join("profile-changes-test", `${randomUUID()}.jpg`);
  await mkdir(path.dirname(resolvePhotoPath(photoPath)), { recursive: true });
  await writeFile(resolvePhotoPath(photoPath), JPEG);
  const { rows: scanRows } = await pool.query<{ id: string }>(
    "INSERT INTO scans (allergen_profile_id, barcode, product_name, result, matched_allergens) VALUES ($1, '000111', 'Crunch Bars', 'contains_allergen', '[]') RETURNING id",
    [profileId],
  );
  const { rows: corrRows } = await pool.query<{ id: string }>(
    `INSERT INTO product_corrections (scan_id, barcode, reported_by, correction_type, direction, allergen, allergen_key, target, verdict_at_report, photo_path)
     VALUES ($1, '000111', $2, 'flag_wrong', 'remove_caution', 'Sesame', 'sesame', 'off_data', 'contains_allergen', $3) RETURNING id`,
    [scanRows[0]!.id, CO_MANAGER, photoPath],
  );
  correctionsToClean.push(corrRows[0]!.id);
  // The scan is gone by the time anyone reads the history — the photo must still be reachable.
  await pool.query("DELETE FROM scans WHERE id = $1", [scanRows[0]!.id]);

  for (const id of [OWNER, CO_MANAGER, FOLLOWER]) cookies.set(id, (await createSession(id)).token);

  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query("DELETE FROM product_corrections WHERE id = ANY($1)", [correctionsToClean]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OWNER, CO_MANAGER, FOLLOWER]]);
  await deletePhoto(photoPath);
  await pool.end();
});

test("the history is mounted, behind auth, newest first, and readable by owner and co-manager", async () => {
  assert.equal((await request(null, "GET", `/profiles/${profileId}/changes`)).status, 401);

  const owner = await request(OWNER, "GET", `/profiles/${profileId}/changes`);
  assert.equal(owner.status, 200);
  const entries = owner.json();
  assert.deepEqual(entries.map((e: { kind: string }) => e.kind), ["downgrade_reported", "allergen_removed", "allergen_added"]);

  const [downgrade, removed, added] = entries;
  assert.equal(downgrade.actorName, "Co Sam");
  assert.equal(downgrade.downgrade.correctionType, "flag_wrong");
  assert.equal(downgrade.downgrade.productName, "Crunch Bars");
  assert.equal(downgrade.downgrade.hasPhoto, true);
  assert.equal(downgrade.downgrade.currentStatus, "pending");
  assert.deepEqual(removed.before, { name: "Peanut", severity: "mild", notes: null, treat_traces_as_unsafe: true });
  assert.equal(removed.actorRole, "co_manager");
  // Unseen for the owner: someone else's changes yes, their own no.
  assert.deepEqual(entries.map((e: { unseen: boolean }) => e.unseen), [true, true, false]);
  assert.equal(added.actorIsViewer, true);

  const coManager = await request(CO_MANAGER, "GET", `/profiles/${profileId}/changes`);
  assert.equal(coManager.status, 200);
  assert.ok(coManager.json().every((e: { unseen: boolean }) => e.unseen === false), "only the owner has unseen entries");
});

test("a follower can't read the history — not even a severe_only one, who mustn't learn a mild allergen's name", async () => {
  const res = await request(FOLLOWER, "GET", `/profiles/${profileId}/changes`);
  assert.equal(res.status, 404);
  assert.ok(!res.text.includes("Peanut"));
});

test("no response from these routes carries an email address (R9)", async () => {
  for (const userId of [OWNER, CO_MANAGER]) {
    const { text } = await request(userId, "GET", `/profiles/${profileId}/changes`);
    for (const email of EMAILS) assert.ok(!text.includes(email), `history leaked ${email}`);
  }
  const { text } = await request(OWNER, "GET", "/me/unseen-changes");
  for (const email of EMAILS) assert.ok(!text.includes(email));
});

test("the downgrade's photo is served from the entry after its scan is gone; bad ids and followers get 404", async () => {
  const entries = (await request(OWNER, "GET", `/profiles/${profileId}/changes`)).json();
  const downgradeId = entries[0].id;

  const photo = await request(CO_MANAGER, "GET", `/profiles/${profileId}/changes/${downgradeId}/photo`);
  assert.equal(photo.status, 200);
  assert.equal(photo.contentType, "image/jpeg");

  assert.equal((await request(OWNER, "GET", `/profiles/${profileId}/changes/not-a-uuid/photo`)).status, 404);
  assert.equal((await request(OWNER, "GET", `/profiles/${profileId}/changes/${randomUUID()}/photo`)).status, 404);
  // An entry with no photo (the allergen removal) is a 404, not an attempt to serve nothing.
  assert.equal((await request(OWNER, "GET", `/profiles/${profileId}/changes/${entries[1].id}/photo`)).status, 404);
  assert.equal((await request(FOLLOWER, "GET", `/profiles/${profileId}/changes/${downgradeId}/photo`)).status, 404);
});

test("only the owner can acknowledge; the banner count follows the acks", async () => {
  assert.deepEqual((await request(OWNER, "GET", "/me/unseen-changes")).json(), [
    {
      profileId,
      label: "Test Child",
      isSelf: false,
      count: 2,
      actorNames: ["Co Sam"],
      outsideApp: false,
      unnamedActor: false,
      hasDowngrade: true,
      hasProfileChange: true,
    },
  ]);
  assert.deepEqual((await request(CO_MANAGER, "GET", "/me/unseen-changes")).json(), []);

  const ids = (await request(OWNER, "GET", `/profiles/${profileId}/changes`)).json().map((e: { id: string }) => e.id);
  assert.equal((await request(CO_MANAGER, "POST", `/profiles/${profileId}/changes/seen`, { changeIds: ids })).status, 404);
  assert.equal((await request(OWNER, "POST", `/profiles/${profileId}/changes/seen`, { changeIds: "all" })).status, 400);
  assert.equal((await request(OWNER, "POST", `/profiles/${profileId}/changes/seen`, { changeIds: [1, 2] })).status, 400);

  const seen = await request(OWNER, "POST", `/profiles/${profileId}/changes/seen`, { changeIds: ids });
  assert.equal(seen.status, 200);
  assert.deepEqual(seen.json(), { acknowledged: 3 });
  assert.deepEqual((await request(OWNER, "GET", "/me/unseen-changes")).json(), []);
});
