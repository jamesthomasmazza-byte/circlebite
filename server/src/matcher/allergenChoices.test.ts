import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { ALLERGEN_CHOICES, choiceForKey, recognizeAllergenName, spellingKey } from "./allergenChoices.js";
import { computeVerdict, matchAllergen, type ProductForMatching } from "./match.js";
import { SYNONYM_CLUSTERS } from "./synonyms.js";

after(async () => {
  await pool.end();
});

const cluster = (id: string) => SYNONYM_CLUSTERS.find((c) => c.id === id)!;

test("every listed allergen's display name is one of its own cluster's aliases", () => {
  for (const choice of ALLERGEN_CHOICES) {
    assert.ok(cluster(choice.key), `${choice.key} is a cluster`);
    assert.ok(cluster(choice.key).aliases.includes(choice.displayName.toLowerCase()), `${choice.displayName} is an alias of ${choice.key}`);
    assert.equal(recognizeAllergenName(choice.displayName)?.key, choice.key);
  }
});

test("every cluster the matcher knows is offered, once", () => {
  assert.deepEqual(
    ALLERGEN_CHOICES.map((c) => c.key).sort(),
    SYNONYM_CLUSTERS.map((c) => c.id).sort(),
  );
});

test("every hint claims only what that cluster's own keywords match", () => {
  const claims: Record<string, { matches: string[]; notThis?: [string, string][] }> = {
    dairy: { matches: ["lactose", "whey", "casein"] },
    "tree-nut": { matches: ["almond", "cashew", "walnut"] },
    gluten: { matches: ["barley", "rye"] },
    crustacean: { matches: ["crab", "shrimp", "lobster"], notThis: [["clams", "mollusc"], ["oysters", "mollusc"]] },
  };
  for (const choice of ALLERGEN_CHOICES.filter((c) => c.hint)) {
    if (choice.group === "single_nut") {
      assert.ok(cluster(choice.key).keywords.includes("nuts"), `${choice.displayName}'s hint says it matches unnamed nuts`);
      continue;
    }
    const claim = claims[choice.key];
    assert.ok(claim, `${choice.displayName} has a hint this test checks`);
    for (const word of claim.matches) {
      assert.match(choice.hint!, new RegExp(word, "i"));
      assert.ok(cluster(choice.key).keywords.includes(word), `${word} is a ${choice.key} keyword`);
    }
    for (const [word, other] of claim.notThis ?? []) {
      assert.ok(!cluster(choice.key).keywords.includes(word) && cluster(other).keywords.includes(word));
    }
  }
});

test("no spelling is claimed by two clusters, so recognizing a name is never a guess", () => {
  const owner = new Map<string, string>();
  for (const c of SYNONYM_CLUSTERS) {
    for (const alias of c.aliases) {
      const prior = owner.get(spellingKey(alias));
      assert.ok(prior === undefined || prior === c.id, `${alias}: ${prior} and ${c.id}`);
      owner.set(spellingKey(alias), c.id);
    }
  }
});

test("production's spellings (2026-10-23): every one recognized, and only treenuts needed the spelling check", () => {
  for (const name of ["egg", "eggs", "milk", "peanut", "peanuts", "sesame", "tree nut", "wheat"]) {
    assert.equal(recognizeAllergenName(name)?.exact, true, name);
  }
  assert.deepEqual(recognizeAllergenName("treenuts"), { key: "tree-nut", exact: false });
  assert.deepEqual(recognizeAllergenName("Tree-Nuts"), { key: "tree-nut", exact: false });
  assert.equal(recognizeAllergenName("Ownertest"), null);
  assert.equal(recognizeAllergenName("Mustard"), null);
});

// Barcode 096619160761 — the Oct 16 chewy bar, from production's products row (JT, 2026-10-23).
const CHEWY_BAR: ProductForMatching = {
  found: true,
  allergensTags: ["milk", "nuts", "peanuts", "soybeans", "coconut"],
  tracesTags: ["eggs", "nuts"],
  ingredientsText:
    "PEANUTS, ISOLATED SOY PROTEIN (ISOLATED SOY PROTEIN, TAPIOCA STARCH, SALT), CHICORY ROOT EXTRACT, DARK CHOCOLATE " +
    "FLAVORED COATING (SUGAR, PALM KERNEL OIL, COCOA POWDER, DRY WHOLE MILK, SOY LECITHIN, SALT), PEANUT BUTTER, SEMISWEET " +
    "CHOCOLATE CHIPS (SUGAR, CHOCOLATE LIQUOR, COCOA BUTTER, SOY LECITHIN, SALT, VANILLA EXTRACT), VEGETABLE GLYCERIN, CORN " +
    "SYRUP, ISOLATED SOY PROTEIN, GUM ARABIC, CHICORY ROOT INULIN, MALTODEXTRIN, SEA SALT, SOY LECITHIN, DRIED UNSWEETENED " +
    "COCONUT, ALMONDS, NATURAL FLAVOR, ALMOND BUTTER.",
};

test("the Oct 16 miss: 'treenuts' by name alone comes back clear on the chewy bar, and its key finds the almonds", () => {
  const byName = { name: "treenuts", severity: "severe" as const, treatTracesAsUnsafe: true };
  const textOnly = { ...CHEWY_BAR, allergensTags: [], tracesTags: [] };
  assert.equal(matchAllergen("treenuts", textOnly).matched, false, "the bug, as production ran it");

  const keyed = { ...byName, key: recognizeAllergenName("treenuts")!.key };
  assert.deepEqual(matchAllergen("treenuts", textOnly, keyed.key), {
    allergenName: "treenuts",
    matched: true,
    source: "ingredients",
    matchedText: "ALMOND", // from "ALMOND BUTTER": keywords are tried in order, "almond" before "almonds"
  });
  const { matchedAllergens } = computeVerdict([keyed], CHEWY_BAR);
  assert.equal(matchedAllergens[0].classification, "contains");
});

test("the seeded Almond Granola: 'treenuts' misses its almonds tag by name, and its key finds it", () => {
  const granola: ProductForMatching = { found: true, allergensTags: ["almonds"], tracesTags: [], ingredientsText: null };
  assert.equal(matchAllergen("treenuts", granola).matched, false);
  assert.equal(matchAllergen("treenuts", granola, "tree-nut").source, "tag");
});

test("a key only adds: everything the name matched alone, it still matches", () => {
  const literal: ProductForMatching = { found: true, allergensTags: [], tracesTags: [], ingredientsText: "contains treenuts" };
  assert.equal(matchAllergen("treenuts", literal, "tree-nut").matched, true);
  assert.equal(matchAllergen("Mustard", { ...literal, ingredientsText: "mustard seed" }, "other").matched, true);
  assert.equal(matchAllergen("Mustard", { ...literal, ingredientsText: "mustard seed" }, "no-such-cluster").matched, true);
});

// Migration 0046, run from its own file against a session-private TEMP copy of allergens (the
// correctionsAllergenKey.test.ts pattern): the real table is never altered, and the transaction is
// rolled back.
const MIGRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations/0046_allergens_add_allergen_key.sql");

test("0046 keys each allergen as recognizeAllergenName does, flags only what needs a look, and renames nothing", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE allergens (LIKE public.allergens INCLUDING DEFAULTS) ON COMMIT DROP");
    await client.query("ALTER TABLE allergens DROP COLUMN IF EXISTS allergen_key, DROP COLUMN IF EXISTS key_needs_review");
    const names = [
      ...SYNONYM_CLUSTERS.flatMap((c) => c.aliases.flatMap((a) => [a, ` ${a.toUpperCase()} `])),
      "treenuts",
      "Tree-Nuts",
      "Brazilnuts",
      "Ownertest",
      "Mustard",
      "s",
    ];
    const profile = "00000000-0000-0000-0000-000000000046";
    for (const name of names) {
      await client.query(
        "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, $2, 'severe', true)",
        [profile, name],
      );
    }

    await client.query(await readFile(MIGRATION, "utf8"));

    const { rows } = await client.query<{ name: string; allergen_key: string | null; key_needs_review: boolean }>(
      "SELECT name, allergen_key, key_needs_review FROM allergens",
    );
    assert.equal(rows.length, names.length);
    assert.deepEqual(rows.map((r) => r.name).sort(), [...names].sort(), "no name changed");
    for (const row of rows) {
      const recognized = recognizeAllergenName(row.name);
      assert.equal(row.allergen_key, recognized?.key ?? null, `key for ${JSON.stringify(row.name)}`);
      assert.equal(row.key_needs_review, recognized === null || !recognized.exact, `review for ${JSON.stringify(row.name)}`);
      if (row.allergen_key) assert.ok(choiceForKey(row.allergen_key));
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

// The report form's allergen dropdown lists the card's own rows (client Scan.tsx), and each row is
// named by the profile's allergen — so a picked allergen reads the same on the profile, the card and
// the report form, with no name of the list's own in between.
test("a picked allergen's card row carries the list's display name — what the report form offers", () => {
  for (const choice of ALLERGEN_CHOICES) {
    const { matchedAllergens } = computeVerdict(
      [{ name: choice.displayName, severity: "severe", treatTracesAsUnsafe: true, key: choice.key }],
      CHEWY_BAR,
    );
    assert.equal(matchedAllergens[0].allergenName, choice.displayName);
  }
});
