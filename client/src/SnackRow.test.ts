import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import type { MatchedAllergen, SnackItem } from "./lib/api";
import { SnackRow } from "./SnackRow";

// One compact row of the Snacks tab (JT's mockup, Nov 14; behind SNACK_LIST).

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
    amazon: null,
    headline: "safe",
    ...over,
  };
}
const CONTAINS = item({
  id: "i-2",
  barcode: "2990000000021",
  product: { name: "Crunchy Peanut Bar", brand: "Hearthfield" },
  original: { result: "contains_allergen", matched_allergens: [row("Peanut", { matched: true, source: "tag", classification: "contains" }), row("Sesame", { severity: "moderate" })] },
  headline: "contains_allergen",
  shop: null,
});
const MAY = item({
  id: "i-3",
  product: { name: "Oat Biscuits", brand: "Fernhallow" },
  original: { result: "may_contain_caution", matched_allergens: [row("Peanut"), row("Sesame", { matched: true, source: "trace", severity: "moderate", classification: "caution" })] },
  headline: "may_contain_caution",
  note: "For playdates",
});
const LINKED = { asin: "B07PGL2ZSL", linked_by: "Grandma", linked_at: "2026-11-13T16:00:00Z", source: "item" as const };

const noop = async () => {};
const inRouter = (el: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
type RowProps = Parameters<typeof SnackRow>[0];
const renderRow = (i: SnackItem, extra: Partial<RowProps> = {}) => inRouter(createElement(SnackRow, { item: i, profile: MAYA, ...extra }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

// ---- Rows ----

test("a row: the photo placeholder, the name, the brand, a verdict pill naming the allergen in the verdict's colour, the whole row a link to the detail page", () => {
  const html = renderRow(CONTAINS);
  assert.match(html, /^<li class="snack-row" data-verdict="contains_allergen"><a class="snack-row__main" href="\/snacks\/i-2\?profile=p-maya"[^>]*>/);
  assert.match(html, /<span class="product-photo product-photo--row product-photo--empty" aria-hidden="true"><svg/);
  assert.match(html, /<strong class="snack-row__name">Crunchy Peanut Bar<\/strong><span class="snack-row__brand card__meta">Hearthfield<\/span><span class="verdict-pill snack-row__pill">Contains: Peanut<\/span>/);
  assert.match(renderRow(MAY), /data-verdict="may_contain_caution".*Oat Biscuits.*verdict-pill snack-row__pill">May contain: Sesame</);
  assert.match(renderRow(item({})), /data-verdict="safe".*verdict-pill snack-row__pill">No listed allergens</);
  assert.match(renderRow(item({ headline: "unable_to_confirm", original: { result: "unable_to_confirm", matched_allergens: [row("Peanut", { classification: "unchecked" })] } })), /data-verdict="unable_to_confirm".*>Unable to confirm</);
  assert.match(renderRow(item({ product: { name: "Plain Rice Crackers", brand: "Hearthfield", image_small: "https://images.openfoodfacts.org/x.200.jpg" } })), /<img class="product-photo product-photo--row" src="https:\/\/images\.openfoodfacts\.org\/x\.200\.jpg" alt="" referrer[Pp]olicy="no-referrer" loading="lazy" decoding="async"\/>/);
});

test("a row carries nothing from the old card: no buttons, no note, no disclaimer, no scan-when-it-arrives line, no Approved by, and never the word safe", () => {
  for (const i of [item({}), CONTAINS, MAY]) {
    const html = renderRow(i, { cartsEnabled: true, onToggle: () => {} });
    assert.doesNotMatch(html, /<button|Screening aid|Scan it when it arrives|For playdates|Approved by|Edit note|Remove/);
    assert.doesNotMatch(html, /Link on Amazon/, "a follower never gets the link control");
    assert.doesNotMatch(text(html), /\bsafe\b/i);
  }
});

test("'· On Amazon' after the brand once linked; a nameless product reads Unknown product", () => {
  assert.match(renderRow(item({ amazon: LINKED })), /snack-row__brand card__meta">Hearthfield · On Amazon</);
  assert.match(renderRow(item({ amazon: LINKED, product: { name: null, brand: null } })), /Unknown product.*snack-row__brand card__meta">On Amazon</);
  assert.doesNotMatch(renderRow(item({})), /On Amazon/);
});

test("carts on: the checkbox only once the item is linked, 44px and named for the product; a Contains item reads Not for cart; carts off, neither", () => {
  const linked = renderRow(item({ amazon: LINKED }), { cartsEnabled: true, onToggle: () => {} });
  assert.match(linked, /<label class="snack-row__select"><input type="checkbox" aria-label="Select Plain Rice Crackers for the Amazon cart"\/><\/label><\/li>$/);
  assert.match(renderRow(item({ amazon: LINKED }), { cartsEnabled: true, selected: true, onToggle: () => {} }), /aria-label="[^"]+" checked=""/);
  const contains = renderRow(CONTAINS, { cartsEnabled: true, canManage: true, onToggle: () => {}, onLinkAmazon: noop });
  assert.match(contains, /<span class="snack-row__nocart card__meta">Not for cart<\/span><\/li>$/);
  assert.doesNotMatch(contains, /checkbox|Link on Amazon/);
  assert.doesNotMatch(renderRow(item({ amazon: LINKED })), /checkbox|Not for cart/);
});

test("carts on, not linked: a manager gets a small Link on Amazon in the checkbox's place — the Amazon search in a new tab — and no checkbox; a follower gets nothing there (JT, Nov 14)", () => {
  const manager = renderRow(item({}), { cartsEnabled: true, canManage: true, onToggle: () => {}, onLinkAmazon: noop });
  assert.match(manager, /<a class="snack-row__link" href="https:\/\/www\.amazon\.com\/s\?k=Plain%20Rice%20Crackers%20Hearthfield" target="_blank" rel="noopener noreferrer" aria-label="Link on Amazon: Plain Rice Crackers">Link on Amazon<\/a><\/li>$/);
  assert.doesNotMatch(manager, /checkbox|snack-row__link-form/);
  const follower = renderRow(item({}), { cartsEnabled: true, onToggle: () => {} });
  assert.match(follower, /<\/a><\/li>$/, "the row's link closes the row: nothing on the right");
  assert.doesNotMatch(follower, /checkbox|Link on Amazon|Not for cart/);
});

test("a no-allergen profile's row has no pill and no verdict colour", () => {
  const html = renderRow(CONTAINS, { plain: true });
  assert.match(html, /^<li class="snack-row"><a/);
  assert.doesNotMatch(html, /verdict-pill|data-verdict|Contains/);
});

const ROW = readFileSync(new URL("./SnackRow.tsx", import.meta.url), "utf8");

test("the row's Link on Amazon opens the paste box inline under the row, and the pasted link goes to the server, which keeps the ASIN", () => {
  assert.match(ROW, /const canLink = cartsEnabled && canManage && Boolean\(item\.shop\) && !item\.amazon && Boolean\(onLinkAmazon\);/);
  assert.match(ROW, /setLinking\(true\);/);
  assert.match(ROW, /\{linking && canLink && \(\s*<form className="snack-item__note-form snack-item__link-form snack-row__link-form"/);
  assert.match(ROW, /await onLinkAmazon\(draft\.trim\(\)\);/);
  assert.match(ROW, /linkRefusedLine\(draft\)/);
});
