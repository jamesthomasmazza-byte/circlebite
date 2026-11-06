import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProfileSummary } from "./lib/api";
import { ScanPill } from "./ScanPill";

// Scan's own "Scanning for" pill (JT, 2026-11-06, behind SCAN_REDESIGN).

const MAYA: ProfileSummary = { id: "m", label: "Maya", is_self: false, relationship: "owner", allergen_names: ["Peanut", "Sesame"] };
const NOOR: ProfileSummary = { id: "n", label: "Noor", is_self: false, share_level: "severe_only", allergen_names: [] };
const render = (chosen: ProfileSummary) => renderToStaticMarkup(createElement(ScanPill, { profiles: [MAYA, NOOR], chosen, onChoose: () => {} }));

test("the pill: initial, \"Scanning for\", the name, and the existing switcher as its chevron", () => {
  const html = render(MAYA);
  assert.match(html, /scan-pill__initial" aria-hidden="true">M</);
  assert.match(html, /Scanning for<\/span><span class="scan-pill__name">Maya</);
  assert.match(html, /<select class="scan-pill__select" aria-label="Scanning for">/);
  assert.match(html, /<option value="m" selected="">/);
  assert.match(html, /<option value="n">/);
});

test("chips: the names only, never a severity", () => {
  const html = render(MAYA);
  assert.match(html, /<li class="scan-chip">Peanut<\/li><li class="scan-chip">Sesame<\/li>/);
  const chips = html.slice(html.indexOf('<ul class="scan-chips"'));
  assert.doesNotMatch(chips, /severe|moderate|mild/i);
});

test("a severe-only follower with nothing severe: \"only severe allergens are shared\", never \"no allergens\"", () => {
  const html = render(NOOR);
  assert.match(html, /Only severe allergens are shared with you/);
  assert.doesNotMatch(html, /No allergens/);
});
