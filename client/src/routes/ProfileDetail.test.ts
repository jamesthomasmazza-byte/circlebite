import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Every form control on the profile page has an accessible name (2026-10-28 audit: axe select-name,
// critical, on each allergen's severity dropdown). The page fetches on mount, so this reads the
// source: a control either sits inside a <label> or carries its own aria-label.

const SOURCE = readFileSync(new URL("./ProfileDetail.tsx", import.meta.url), "utf8");

function controls(source: string): { tag: string; at: number; text: string }[] {
  return [...source.matchAll(/<(select|input|textarea)\b[^>]*>/g)].map((m) => ({ tag: m[1], at: m.index!, text: m[0] }));
}

function insideLabel(source: string, at: number): boolean {
  const before = source.slice(0, at);
  return (before.match(/<label\b/g)?.length ?? 0) > (before.match(/<\/label>/g)?.length ?? 0);
}

// The add-allergen form moved into its own file (2026-11-05), still on this page.
const ADD_ALLERGEN_SOURCE = readFileSync(new URL("../AddAllergen.tsx", import.meta.url), "utf8");

test("every select, input and textarea on the profile page has an accessible name", () => {
  const sources = [SOURCE, ADD_ALLERGEN_SOURCE];
  assert.ok(sources.flatMap(controls).length >= 6, "the page's controls were found");
  for (const source of sources) {
    for (const c of controls(source)) {
      assert.ok(/aria-label=/.test(c.text) || insideLabel(source, c.at), `unnamed <${c.tag}>: ${c.text.slice(0, 80)}`);
    }
  }
});

test("each allergen's severity dropdown is named after its allergen", () => {
  assert.match(SOURCE, /aria-label=\{`Severity of \$\{a\.name\}`\}/);
});

test("the allergens come before the name and notes form, and the change history after both", () => {
  // 2026-10-28 audit: at 390px the Allergens section started about 650px down. Order only.
  const allergens = SOURCE.indexOf("<h2>Allergens</h2>");
  const details = SOURCE.indexOf("<form onSubmit={handleSaveDetails}>");
  const history = SOURCE.indexOf("<ChangeHistory");
  assert.ok(allergens > 0 && details > allergens && history > details);
});

test("acknowledging sends exactly the unseen entries on screen, never everything up to now", () => {
  // Condition 2 and migration 0040: an entry that arrives after the page loaded must stay unseen.
  assert.match(SOURCE, /\(history \?\? \[\]\)\.filter\(\(e\) => e\.unseen\)\.map\(\(e\) => e\.id\)/);
  assert.match(SOURCE, /acknowledgeProfileChanges\(id!, shown\)/);
});

test("the allergen list comes before the add button, and an empty profile starts with the form open", () => {
  const list = SOURCE.indexOf("{profile.allergens.map(");
  const add = SOURCE.indexOf("<AddAllergen");
  assert.ok(list > 0 && add > list);
  assert.match(SOURCE, /startOpen=\{profile\.allergens\.length === 0\}/);
});
