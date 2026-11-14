import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchedAllergen, SnackItem } from "../lib/api";
import { SnackCartBar } from "./Snacks";

// The Snacks tab rebuilt to JT's mockup (Nov 14; behind SNACK_LIST): compact rows that open a detail
// page, one screening note per page, the cart bar. Nothing about verdicts changed (snackList.test.ts).

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
const LINKED = { asin: "B07PGL2ZSL", linked_by: "Grandma", linked_at: "2026-11-13T16:00:00Z" };


const PAGE = readFileSync(new URL("./Snacks.tsx", import.meta.url), "utf8");

test("the page: the title row with the count, one screening note under it (not on a plain list), the search box, rows, the sticky cart bar; the manager's empty line gone", () => {
  assert.match(PAGE, /<div className="snacks__title">\s*<h1>\{listTitle\(profile\)\}<\/h1>\s*\{list && <span className="snacks__count card__meta">\{itemCount\(list\.items\.length\)\}<\/span>\}/);
  assert.match(PAGE, /\{list !== null && !plain && \(\s*<p role="note" className="snacks__note">\s*\{SCREENING_NOTE\}/);
  assert.match(PAGE, /const plain = list !== null && list\.allergen_count === 0;/);
  assert.match(PAGE, /\{snackSearchEnabled && <SnackSearch profile=\{profile\} canManage=\{canManage\} onAdded=\{refresh\} \/>\}/);
  assert.match(PAGE, /\{list && list\.items\.length === 0 && !canManage && <p className="snacks__empty">\{emptyLine\(profile, false\)\}<\/p>\}/);
  assert.match(PAGE, /<ul className="snacks__rows">/);
  assert.match(PAGE, /\{snackCartsEnabled && \(linkable > 0 \|\| \(canManage && shoppable\.length > 0\)\) && \(\s*<SnackCartBar/);
  assert.match(PAGE, /const linked = new Set\(l\.items\.filter\(\(i\) => i\.amazon && i\.shop\)\.map\(\(i\) => i\.id\)\);/, "only linked items stay ticked");
  assert.match(PAGE, /canManage=\{canManage\}\s*selected=\{selected\.has\(item\.id\)\}\s*onToggle=\{\(\) => toggle\(item\.id\)\}\s*onLinkAmazon=\{async \(url\) => \{\s*await linkSnackOnAmazon\(profile\.id, item\.id, url\);/);
  assert.match(PAGE, /setCartResult\(await buildSnackCart\(profile!\.id, \[\.\.\.selected\]\)\)/);
  assert.doesNotMatch(PAGE, /cart\/add\.html|DISCLAIMER_SHORT|SCAN_WHEN_IT_ARRIVES|EMPTY_SCAN_LINK|SnackItemCard|\.sort\(/);
  assert.match(PAGE, /const \{ chosenProfileId, profiles, profilesLoaded \} = useScanningFor\(\);/);
  assert.match(PAGE, /if \(!loading && !snackListEnabled\) \{/);
});

function bar(over: Partial<Parameters<typeof SnackCartBar>[0]> = {}): string {
  return renderToStaticMarkup(createElement(SnackCartBar, { count: 0, busy: false, result: null, error: null, onBuild: () => {}, ...over }));
}

test("the cart bar: Add N to Amazon cart, disabled at none; building says so; the result above the button names who went in, who was left out and why, who was refused and why", () => {
  assert.match(bar(), /<div class="snacks__cart-bar" aria-label="Amazon cart"><p class="snacks__cart-actions"><button type="button" class="button-primary" disabled="">Add 0 to Amazon cart<\/button><\/p><\/div>/);
  assert.match(bar({ count: 2 }), /<button type="button" class="button-primary">Add 2 to Amazon cart<\/button>/);
  assert.match(bar({ count: 2, busy: true }), /disabled="">Building the cart…</);
  assert.match(bar({ error: "Couldn't build the cart. Try again." }), /<p role="alert">Couldn&#x27;t build the cart\. Try again\.<\/p>/);
  const html = bar({
    count: 3,
    result: {
      url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07PGL2ZSL&Quantity.1=1",
      included: [{ id: "i-1", name: "Plain Rice Crackers", asin: "B07PGL2ZSL" }],
      left_out: [{ id: "i-3", name: "Oat Biscuits" }],
      refused: [{ id: "i-2", name: "Crunchy Peanut Bar" }],
    },
  });
  assert.match(html, /<div role="status" class="snacks__cart-result"><p>1 item is in the cart link\.<\/p>/);
  assert.match(html, /<a class="button-link" href="https:\/\/www\.amazon\.com\/gp\/aws\/cart\/add\.html\?ASIN\.1=B07PGL2ZSL&amp;Quantity\.1=1" target="_blank" rel="noopener noreferrer">Open the Amazon cart<\/a>/);
  assert.match(html, /Left out, no Amazon link yet: Oat Biscuits\./);
  assert.match(html, /Not added — it reads “Contains an allergen” now: Crunchy Peanut Bar\./);
  assert.match(html, /Scan each item when it arrives\./);
  assert.match(bar({ count: 1, result: { url: null, included: [], left_out: [], refused: [{ id: "i-2", name: "Crunchy Peanut Bar" }] } }), /Nothing could go in the cart\./);
});
