import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import type { MatchedAllergen, SnackItem } from "../lib/api";
import { SnackItemCard } from "./Snacks";

// The Snacks tab's item card (docs/snack-list-plan.md decision 7, 2026-11-13; behind SNACK_LIST).

const MAYA = { id: "p-maya", label: "Maya", is_self: false };
const row = (allergenName: string, over: Partial<MatchedAllergen> = {}): MatchedAllergen => ({
  allergenName,
  matched: false,
  source: null,
  severity: "severe",
  classification: "clear",
  ...over,
});

function item(over: Partial<SnackItem>): SnackItem {
  return {
    id: "i-1",
    barcode: "2990000000014",
    product: { name: "Plain Rice Crackers", brand: "Hearthfield" },
    note: null,
    added_by: "Judge 1",
    created_at: "2026-11-13T15:00:00Z",
    scan_id: "s-1",
    original: { result: "safe", matched_allergens: [row("Peanut"), row("Sesame", { severity: "moderate" })] },
    effective: null,
    community_reports: [],
    pending_circle_reports: [],
    shop: { amazon: "https://www.amazon.com/s?k=Plain%20Rice%20Crackers%20Hearthfield", instacart: "https://www.instacart.com/store/s?k=Plain%20Rice%20Crackers%20Hearthfield", affiliate: false },
    headline: "safe",
    ...over,
  };
}

const noop = async () => {};
function render(i: SnackItem, canManage = true): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(SnackItemCard, { item: i, profile: MAYA, canManage, onRemove: noop, onSaveNote: noop })),
  );
}

test("a clean item: the verdict card's own words in its colour, the product, who approved it, both shop links in a new tab", () => {
  const html = render(item({}));
  assert.match(html, /<li class="card snack-item" data-verdict="safe">/);
  assert.match(html, /<p class="verdict-card__headline snack-item__verdict">No listed allergens found<\/p>/);
  assert.match(html, /<strong>Plain Rice Crackers<\/strong><span class="snack-item__brand"> — Hearthfield<\/span>/);
  assert.match(html, /Approved by Judge 1, Nov 13/);
  assert.match(html, /<a class="button-link" href="https:\/\/www\.amazon\.com\/s\?k=Plain%20Rice%20Crackers%20Hearthfield" target="_blank" rel="noopener noreferrer">Shop on Amazon<\/a>/);
  assert.match(html, /<a class="button-link" href="https:\/\/www\.instacart\.com\/store\/s\?k=[^"]+" target="_blank" rel="noopener noreferrer">Shop on Instacart<\/a>/);
  assert.match(html, /Scan it when it arrives — stores can send a different version\./);
  assert.match(html, /Screening aid, not a guarantee — check the label\./);
  assert.doesNotMatch(html, /Label wrong/);
});

test("a Contains item: no shop links come from the server and none are drawn; the correction link opens Scan on the item", () => {
  const html = render(
    item({
      barcode: "2990000000021",
      product: { name: "Crunchy Peanut Bar", brand: "Hearthfield" },
      original: { result: "contains_allergen", matched_allergens: [row("Peanut", { matched: true, source: "tag", classification: "contains" }), row("Sesame", { severity: "moderate" })] },
      headline: "contains_allergen",
      shop: null,
    }),
  );
  assert.match(html, /data-verdict="contains_allergen"/);
  assert.match(html, /snack-item__verdict">Contains an allergen</);
  assert.match(html, /<li>Peanut \(severe\) — contains<\/li>/);
  assert.doesNotMatch(html, /Shop on|amazon\.com|instacart\.com/);
  assert.match(html, /<a href="\/scan\?profile=p-maya&amp;snack=i-1"[^>]*>Label wrong\? Report a correction<\/a>/);
});

test("a circle report that changed the verdict is named, and the engine's own verdict stays alongside", () => {
  const html = render(
    item({
      barcode: "2990000000083",
      product: { name: "Corn Tortilla Chips", brand: "Fernhallow" },
      effective: { result: "contains_allergen", matched_allergens: [row("Peanut"), row("Sesame", { severity: "moderate", classification: "contains", circleReported: true })] },
      pending_circle_reports: [{ allergenName: "Sesame", reporters: [{ name: "Priya Nair", role: "co_manager", isViewer: false }] }],
      headline: "contains_allergen",
      shop: null,
    }),
  );
  assert.match(html, /The product data alone says <strong>No listed allergens found<\/strong>\. Changed because of:/);
  assert.match(html, /Priya Nair/);
  assert.doesNotMatch(html, /Shop on/);
});

test("Unable to confirm keeps its shop links and names what wasn't checked", () => {
  const html = render(
    item({
      product: { name: null, brand: null },
      original: { result: "unable_to_confirm", matched_allergens: [row("Peanut", { classification: "unchecked" })] },
      headline: "unable_to_confirm",
    }),
  );
  assert.match(html, /snack-item__verdict">Unable to confirm</);
  assert.match(html, /<strong>Unknown product<\/strong>/);
  assert.match(html, /Not checked for Peanut: this product&#x27;s record has only ingredient text/);
  assert.match(html, /Shop on Amazon/);
});

test("the note shows when there is one; managers get Edit note or Add a note and Remove, followers get neither", () => {
  const withNote = render(item({ note: "Priya keeps a box for playdates" }));
  assert.match(withNote, /<p class="snack-item__note">Priya keeps a box for playdates<\/p>/);
  assert.match(withNote, /<button type="button">Edit note<\/button><button type="button">Remove<\/button>/);
  assert.match(render(item({})), /<button type="button">Add a note<\/button>/);
  const follower = render(item({ note: "Priya keeps a box for playdates" }), false);
  assert.match(follower, /snack-item__note/);
  assert.doesNotMatch(follower, /Remove|Edit note|Add a note/);
});

test("'Approved <date>' when the approver's account is gone", () => {
  assert.match(render(item({ added_by: null })), /snack-item__approved">Approved Nov 13</);
});

test("never the word 'safe' in what's read, on any verdict (the enum value stays in data-verdict only)", () => {
  for (const headline of ["safe", "contains_allergen", "may_contain_caution", "unable_to_confirm"] as const) {
    const text = render(item({ headline })).replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, /\bsafe\b/i, headline);
  }
});

// The page itself: the switch, the shell's profile, the server's order.
const PAGE = readFileSync(new URL("./Snacks.tsx", import.meta.url), "utf8");

test("the page takes the shell's chosen profile, keeps the server's order, and reads as not found while the switch is off", () => {
  assert.match(PAGE, /const \{ chosenProfileId, profiles, profilesLoaded \} = useScanningFor\(\);/);
  assert.match(PAGE, /scanningForId\(chosenProfileId, profiles\)/);
  assert.doesNotMatch(PAGE, /\.sort\(/, "the server's order: flagged items first");
  assert.match(PAGE, /if \(!loading && !snackListEnabled\) \{/);
  assert.match(PAGE, /canManage = profile\.relationship === "owner" \|\| profile\.relationship === "co_manager"/);
});
