import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProfileSummary } from "./lib/api";
import { ScanPill } from "./ScanPill";

// Scan's own "Scanning for" pill (JT, 2026-11-06, behind SCAN_REDESIGN).

const MAYA: ProfileSummary = { id: "m", label: "Maya", is_self: false, relationship: "owner", allergen_names: ["Peanut", "Sesame"] };
const LEO: ProfileSummary = { id: "l", label: "Leo", is_self: false, relationship: "co_manager", allergen_names: ["Milk"] };
const NOOR: ProfileSummary = { id: "n", label: "Noor", is_self: false, share_level: "severe_only", allergen_names: [] };
const render = (profiles: ProfileSummary[], chosen: ProfileSummary) => renderToStaticMarkup(createElement(ScanPill, { profiles, chosen, onChoose: () => {} }));
const chips = (html: string) => html.slice(html.indexOf('<ul class="scan-chips"'));

test("one profile to scan for: \"Scanning for <name>\", not a control — no select, no chevron", () => {
  const html = render([MAYA], MAYA);
  assert.doesNotMatch(html, /<select|<label|scan-pill__chevron|<button/);
  assert.match(html, /<p class="scan-pill scan-pill--single">/);
  assert.match(html, /Scanning for<\/span> <span class="scan-pill__name">Maya</);
});

test("two or more: the existing switcher lists the names only, never an allergen line", () => {
  const html = render([MAYA, LEO, NOOR], MAYA);
  assert.match(html, /<select class="scan-pill__select" aria-label="Scanning for">/);
  assert.match(html, /<option value="m" selected="">Maya<\/option><option value="l">Leo<\/option><option value="n">Noor<\/option>/);
  const options = html.slice(html.indexOf("<select"), html.indexOf("</select>"));
  assert.doesNotMatch(options, /Peanut|Milk|·|allergen/i);
  assert.match(html, /scan-pill__chevron/);
});

test("two profiles with the same name get the header's suffixes", () => {
  const twinOwned: ProfileSummary = { ...MAYA, id: "m1" };
  const twinFollowed: ProfileSummary = { id: "m2", label: "Maya", is_self: false, share_level: "all", allergen_names: ["Egg"] };
  const html = render([twinOwned, twinFollowed, LEO], twinFollowed);
  assert.match(html, /<option value="m1">Maya \(you own\)<\/option><option value="m2" selected="">Maya \(you follow\)<\/option><option value="l">Leo<\/option>/);
  assert.match(html, /scan-pill__name">Maya \(you follow\)</, "the pill says which one, as the header does");
});

test("the chips are the chosen profile's: they follow the selection", () => {
  assert.match(chips(render([MAYA, LEO], MAYA)), /<li class="scan-chip">Peanut<\/li><li class="scan-chip">Sesame<\/li>/);
  assert.match(chips(render([MAYA, LEO], LEO)), /<li class="scan-chip">Milk<\/li>/);
  assert.doesNotMatch(chips(render([MAYA, LEO], LEO)), /Peanut/);
  assert.doesNotMatch(chips(render([MAYA, LEO], MAYA)), /severe|moderate|mild/i, "names only");
});

test("a severe-only follower: the severe names only, and never \"no allergens\" when there are none", () => {
  const severe: ProfileSummary = { ...NOOR, allergen_names: ["Tree nut"] };
  assert.match(chips(render([MAYA, severe], severe)), /<li class="scan-chip">Tree nut<\/li><\/ul>/);
  const html = render([MAYA, NOOR], NOOR);
  assert.match(html, /<p class="scan-chips__empty">Only severe allergens are shared with you<\/p>/);
  assert.doesNotMatch(html, /No allergens/);
});
