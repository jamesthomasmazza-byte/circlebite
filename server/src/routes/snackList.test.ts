import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { snackListRouter } from "./snackList.js";

// No HTTP harness in this codebase (see scansHistory.test.ts): each route's main handler is found on
// the router and called with a fake req/res, past requireAuth. The kill switch, the access checks,
// the item verdicts and the layering all run for real against Postgres. Nothing here calls the AI.

const OWNER = "aaaaaaaa-0000-0000-0000-0000000000e1";
const CO_MANAGER = "aaaaaaaa-0000-0000-0000-0000000000e2";
const FOLLOWER = "aaaaaaaa-0000-0000-0000-0000000000e3";
const STRANGER = "aaaaaaaa-0000-0000-0000-0000000000e4";
const PROFILE_ID = "bbbbbbbb-0000-0000-0000-0000000000e1";
const OTHER_PROFILE_ID = "bbbbbbbb-0000-0000-0000-0000000000e2";

// Tags are stored normalized (no "en:" prefix), as lib/openFoodFacts.ts writes them.
const NUTTY = "7300000000001"; // structured tag: peanut → Contains
const OATS = "7300000000002"; // structured tag: milk, not on the profile at first → clean
const TEXTY = "7300000000003"; // text only, no name → the model's Path B floor matters
const UNCACHED = "7300000000004"; // a scan whose lookup failed: no products row
const TEXT = "rice flour, sugar, sunflower oil, natural flavor, salt";

type Captured = { status: number; body: unknown };

function call(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  params: Record<string, string>,
  body: unknown,
  userId: string,
): Promise<Captured> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (snackListRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `expected a registered ${method.toUpperCase()} ${path} route`);
  // Everything after requireAuth: the kill switch middleware, then the handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = layer.route.stack.slice(1).map((l: any) => l.handle);

  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(payload: unknown) {
        resolve({ status, body: payload });
      },
      end() {
        resolve({ status, body: undefined });
      },
    };
    const req = { params, body, user: { id: userId } };
    const run = (i: number) => {
      if (i >= stack.length) {
        reject(new Error("route ran out of handlers without responding"));
        return;
      }
      stack[i](req, res, (err?: unknown) => {
        if (err) {
          const e = err as { status?: number; code?: string; detail?: Record<string, unknown> };
          resolve({ status: e.status ?? 500, body: { ...(e.detail ?? {}), error: e.code } });
          return;
        }
        run(i + 1);
      });
    };
    run(0);
  });
}

const list = (userId: string) => call("get", "/profiles/:id/snacks", { id: PROFILE_ID }, undefined, userId);
const add = (userId: string, scanId: string, note?: string) =>
  call("post", "/profiles/:id/snacks", { id: PROFILE_ID }, { scanId, note }, userId);

type Item = {
  id: string;
  barcode: string;
  headline: string;
  note: string | null;
  added_by: string | null;
  original: { result: string; matched_allergens: { allergenName: string; classification: string }[] };
  shop: { amazon: string; instacart: string; affiliate: boolean } | null;
};
const items = (captured: Captured) => (captured.body as { items: Item[] }).items;
const byBarcode = (captured: Captured, barcode: string) => {
  const item = items(captured).find((i) => i.barcode === barcode);
  assert.ok(item, `expected ${barcode} on the list`);
  return item;
};

const scanIds: Record<string, string> = {};
let previousSwitch: boolean;
let previousTag: string | undefined;

async function scan(profileId: string, barcode: string, result: string, matched: unknown[], ingredientsText: string | null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (scanner_id, allergen_profile_id, barcode, result, matched_allergens, ingredients_text)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [OWNER, profileId, barcode, result, JSON.stringify(matched), ingredientsText],
  );
  return rows[0].id;
}

before(async () => {
  previousSwitch = env.snackList;
  previousTag = env.amazonAssociateTag;
  env.snackList = true;
  env.amazonAssociateTag = undefined;

  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'snacks-owner@example.com', 'x', 'James', true, now()),
       ($2, 'snacks-comanager@example.com', 'x', 'Grandma', true, now()),
       ($3, 'snacks-follower@example.com', 'x', 'Sitter', true, now()),
       ($4, 'snacks-stranger@example.com', 'x', 'Nobody', true, now())`,
    [OWNER, CO_MANAGER, FOLLOWER, STRANGER],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Maya'), ($3, $4, 'Other child')", [
    PROFILE_ID,
    OWNER,
    OTHER_PROFILE_ID,
    STRANGER,
  ]);
  await pool.query(
    `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe, allergen_key)
     VALUES ($1, 'Peanut', 'severe', true, 'peanut'), ($1, 'Egg', 'mild', false, 'egg')`,
    [PROFILE_ID],
  );
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id, added_by) VALUES ($1, $2, $3)", [PROFILE_ID, CO_MANAGER, OWNER]);
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level, responded_at)
     VALUES ($1, $2, $3, 'snacks-test-token-all', 'accepted', 'all', now())`,
    [PROFILE_ID, FOLLOWER, OWNER],
  );
  await pool.query(
    `INSERT INTO products (barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data, fetched_at) VALUES
       ($1, true, 'Nutty Bar', 'Acme', 'peanuts, sugar', '{peanut}', '{}', 'null', now()),
       ($2, true, 'Oat Bar', 'Acme Oat Bar', 'oats, sugar, whey', '{milk}', '{}', 'null', now()),
       ($3, true, NULL, NULL, $4, '{}', '{}', 'null', now())`,
    [NUTTY, OATS, TEXTY, TEXT],
  );

  const clearRows = (names: string[]) => names.map((allergenName) => ({ allergenName, severity: "mild", classification: "clear", aiEscalated: false }));
  scanIds[NUTTY] = await scan(
    PROFILE_ID,
    NUTTY,
    "contains_allergen",
    [{ allergenName: "Peanut", severity: "severe", classification: "contains", source: "tag" }, ...clearRows(["Egg"])],
    "peanuts, sugar",
  );
  scanIds[OATS] = await scan(PROFILE_ID, OATS, "safe", clearRows(["Peanut", "Egg"]), "oats, sugar, whey");
  // Path B: the model read TEXT and cleared both allergens on the profile at the time.
  scanIds[TEXTY] = await scan(PROFILE_ID, TEXTY, "safe", clearRows(["Peanut", "Egg"]), TEXT);
  scanIds[UNCACHED] = await scan(PROFILE_ID, UNCACHED, "unable_to_confirm", [], null);
  scanIds.other = await scan(OTHER_PROFILE_ID, NUTTY, "safe", [], null);
});

after(async () => {
  env.snackList = previousSwitch;
  env.amazonAssociateTag = previousTag;
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OWNER, CO_MANAGER, FOLLOWER, STRANGER]]);
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [[NUTTY, OATS, TEXTY]]);
  await pool.end();
});

test("with SNACK_LIST off every route is a plain 404, even for the owner", async () => {
  env.snackList = false;
  try {
    assert.equal((await list(OWNER)).status, 404);
    assert.equal((await add(OWNER, scanIds[NUTTY])).status, 404);
    assert.equal((await call("delete", "/profiles/:id/snacks/:itemId", { id: PROFILE_ID, itemId: OWNER }, undefined, OWNER)).status, 404);
  } finally {
    env.snackList = true;
  }
});

test("a stranger gets 404 on the list, and a follower reads it but can't add", async () => {
  assert.equal((await list(STRANGER)).status, 404);
  const followerList = await list(FOLLOWER);
  assert.equal(followerList.status, 200);
  assert.deepEqual(items(followerList), []);
  assert.equal((await add(FOLLOWER, scanIds[NUTTY])).status, 404);
  assert.equal((await add(STRANGER, scanIds[NUTTY])).status, 404);
});

test("a co-manager adds from a scan; the barcode comes from the scan, and a repeat is 409", async () => {
  const created = await add(CO_MANAGER, scanIds[OATS], "  for playdates ");
  assert.equal(created.status, 201);
  assert.equal((created.body as { barcode: string }).barcode, OATS);

  const repeat = await add(OWNER, scanIds[OATS]);
  assert.equal(repeat.status, 409);
  assert.equal((repeat.body as { error: string; id: string }).error, "already_listed");
  assert.equal((repeat.body as { id: string }).id, (created.body as { id: string }).id);

  const owner = await list(OWNER);
  const item = byBarcode(owner, OATS);
  assert.equal(item.note, "for playdates", "the note is trimmed");
  assert.equal(item.added_by, "Grandma");
});

test("a scan of another profile, a malformed id, and a scan with no product row are refused", async () => {
  assert.equal((await add(OWNER, scanIds.other)).status, 404, "another profile's scan is invisible");
  assert.equal((await add(OWNER, "not-a-uuid")).status, 400);
  const uncached = await add(OWNER, scanIds[UNCACHED]);
  assert.equal(uncached.status, 409);
  assert.equal((uncached.body as { error: string }).error, "product_not_on_file");
  assert.equal((await add(OWNER, scanIds[NUTTY], "x".repeat(201))).status, 400, "a long note is refused before the database");
});

test("a Contains item has no shop links at all; a clean item links both stores by name and brand", async () => {
  assert.equal((await add(OWNER, scanIds[NUTTY])).status, 201);
  const owner = await list(OWNER);

  const nutty = byBarcode(owner, NUTTY);
  assert.equal(nutty.headline, "contains_allergen");
  assert.equal(nutty.original.result, "contains_allergen");
  assert.equal(nutty.shop, null, "the client never receives a link it must hide");

  const oats = byBarcode(owner, OATS);
  assert.equal(oats.headline, "safe");
  assert.equal(oats.shop?.amazon, "https://www.amazon.com/s?k=Oat%20Bar%20Acme%20Oat%20Bar");
  assert.equal(oats.shop?.instacart, "https://www.instacart.com/store/s?k=Oat%20Bar%20Acme%20Oat%20Bar");
  assert.equal(oats.shop?.affiliate, false);
  assert.equal((owner.body as { affiliate: boolean }).affiliate, false);

  // Flagged items come first, whatever order they were added in.
  assert.deepEqual(
    items(owner).map((i) => i.barcode),
    [NUTTY, OATS],
  );
});

test("a text-only item with no name links by barcode, and is clean while the model's clearance covers every allergen", async () => {
  assert.equal((await add(OWNER, scanIds[TEXTY])).status, 201);
  const texty = byBarcode(await list(OWNER), TEXTY);
  assert.equal(texty.headline, "safe");
  assert.equal(texty.shop?.amazon, `https://www.amazon.com/s?k=${TEXTY}`);
});

test("an allergen added to the profile later flags the items it now catches, at the top, with no AI call", async () => {
  await pool.query(
    "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe, allergen_key) VALUES ($1, 'Milk', 'moderate', false, 'milk')",
    [PROFILE_ID],
  );
  try {
    const owner = await list(OWNER);
    // Oat Bar's record lists milk: the matcher now catches it, and the shop links go away.
    const oats = byBarcode(owner, OATS);
    assert.equal(oats.headline, "contains_allergen");
    assert.equal(oats.original.matched_allergens.find((m) => m.allergenName === "Milk")?.classification, "contains");
    assert.equal(oats.shop, null);
    // The text-only product: the model never looked for milk in that text, so the item fails closed.
    const texty = byBarcode(owner, TEXTY);
    assert.equal(texty.headline, "unable_to_confirm");
    assert.equal(texty.original.matched_allergens.find((m) => m.allergenName === "Milk")?.classification, "unchecked");
    assert.ok(texty.shop, "Unable to confirm keeps its shop links; only Contains loses them");

    assert.deepEqual(
      items(owner).map((i) => i.headline),
      ["contains_allergen", "contains_allergen", "unable_to_confirm"],
    );
  } finally {
    await pool.query("DELETE FROM allergens WHERE allergen_profile_id = $1 AND name = 'Milk'", [PROFILE_ID]);
  }
});

test("the Associates tag reaches the Amazon link only when set, and flags the disclosure", async () => {
  env.amazonAssociateTag = "circlebite-20";
  try {
    const owner = await list(OWNER);
    const oats = byBarcode(owner, OATS);
    assert.ok(oats.shop?.amazon.endsWith("&tag=circlebite-20"));
    assert.ok(!oats.shop?.instacart.includes("tag="));
    assert.equal(oats.shop?.affiliate, true);
    assert.equal((owner.body as { affiliate: boolean }).affiliate, true);
  } finally {
    env.amazonAssociateTag = undefined;
  }
});

test("notes and removal are for managers; a follower's attempt is 404, and a removed item is gone for everyone", async () => {
  const oatsId = byBarcode(await list(OWNER), OATS).id;
  const path = "/profiles/:id/snacks/:itemId";
  const params = { id: PROFILE_ID, itemId: oatsId };

  assert.equal((await call("patch", path, params, { note: "grandma's pick" }, FOLLOWER)).status, 404);
  const patched = await call("patch", path, params, { note: "grandma's pick" }, CO_MANAGER);
  assert.equal(patched.status, 200);
  assert.equal((patched.body as { note: string }).note, "grandma's pick");
  const cleared = await call("patch", path, params, { note: "" }, OWNER);
  assert.equal((cleared.body as { note: string | null }).note, null, "an empty note clears it");
  assert.equal((await call("patch", path, params, {}, OWNER)).status, 400, "a body with no note is a bad request");

  assert.equal((await call("delete", path, params, undefined, FOLLOWER)).status, 404);
  assert.equal((await call("delete", path, params, undefined, STRANGER)).status, 404);
  assert.equal((await call("delete", path, { id: OTHER_PROFILE_ID, itemId: oatsId }, undefined, STRANGER)).status, 404, "not through another profile either");
  assert.equal((await call("delete", path, params, undefined, OWNER)).status, 204);
  assert.equal((await call("delete", path, params, undefined, OWNER)).status, 404, "already gone");
  assert.equal(items(await list(FOLLOWER)).some((i) => i.barcode === OATS), false);
});

test("the scan reference is set null when the scan is deleted, and the text-only item then fails closed", async () => {
  await pool.query("DELETE FROM scans WHERE id = $1", [scanIds[TEXTY]]);
  const texty = byBarcode(await list(OWNER), TEXTY);
  assert.equal(texty.headline, "unable_to_confirm", "no model answer to carry, so the matcher alone can't clear a text-only product");
  assert.equal(texty.original.matched_allergens.every((m) => m.classification === "unchecked"), true);
});
