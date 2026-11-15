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
const LINKED = { asin: "B07PGL2ZSL", linked_by: "Grandma", linked_at: "2026-11-13T16:00:00Z", source: "item" as const };


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
  // One tap (JT, Nov 14): the cart is built as the ticks settle, never by a button; a stale response is dropped.
  assert.match(PAGE, /const selectedKey = \[\.\.\.selected\]\.join\(","\);/);
  assert.match(PAGE, /if \(selected\.size === 0\) \{\s*setCartBusy\(false\);\s*setCartResult\(null\);\s*setCartError\(null\);\s*return;/);
  assert.match(PAGE, /const timer = setTimeout\(\(\) => \{\s*buildSnackCart\(profile\.id, \[\.\.\.selected\]\)\s*\.then\(\(r\) => \{\s*if \(live\) setCartResult\(r\);/);
  assert.match(PAGE, /\}, CART_DEBOUNCE_MS\);\s*return \(\) => \{\s*live = false;\s*clearTimeout\(timer\);/);
  assert.match(PAGE, /\}, \[selectedKey, profile\?\.id, snackCartsEnabled, reads, cartTries\]\);/);
  assert.match(PAGE, /<SnackCartBar count=\{selected\.size\} busy=\{cartBusy\} result=\{cartResult\} error=\{cartError\} onRetry=\{\(\) => setCartTries\(\(n\) => n \+ 1\)\} \/>/);
  assert.doesNotMatch(PAGE, /onBuild|buildCart\(|CART_BUILDING|OPEN_CART|cartIncludedLine/);
  assert.doesNotMatch(PAGE, /cart\/add\.html|DISCLAIMER_SHORT|SCAN_WHEN_IT_ARRIVES|EMPTY_SCAN_LINK|SnackItemCard|\.sort\(/);
  assert.match(PAGE, /const \{ chosenProfileId, profiles, profilesLoaded \} = useScanningFor\(\);/);
  assert.match(PAGE, /if \(!loading && !snackListEnabled\) \{/);
});

function bar(over: Partial<Parameters<typeof SnackCartBar>[0]> = {}): string {
  return renderToStaticMarkup(createElement(SnackCartBar, { count: 0, busy: false, result: null, error: null, onRetry: () => {}, ...over }));
}

const BUILT = {
  url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07PGL2ZSL&Quantity.1=1",
  included: [{ id: "i-1", name: "Plain Rice Crackers", asin: "B07PGL2ZSL" }],
  left_out: [{ id: "i-3", name: "Oat Biscuits" }],
  refused: [{ id: "i-2", name: "Crunchy Peanut Bar" }],
};

test("the cart bar, one tap: a disabled button at none and while building; the link itself once built, in a new tab, counting what it adds; left out and refused named under it", () => {
  assert.match(bar(), /<div class="snacks__cart-bar" aria-label="Amazon cart"><p class="snacks__cart-actions"><button type="button" class="button-primary" disabled="">Add 0 to Amazon cart<\/button><\/p><\/div>/);
  assert.match(bar({ count: 2, busy: true }), /<button type="button" class="button-primary" disabled="" aria-busy="true">Add 2 to Amazon cart<\/button><\/p><\/div>/, "building: the same words, disabled, no lines yet");
  const html = bar({ count: 3, result: BUILT });
  assert.match(html, /<p class="snacks__cart-actions"><a class="button-link button-link--primary" href="https:\/\/www\.amazon\.com\/gp\/aws\/cart\/add\.html\?ASIN\.1=B07PGL2ZSL&amp;Quantity\.1=1" target="_blank" rel="noopener noreferrer">Add 1 to Amazon cart<\/a><\/p>/, "the link adds one, whatever was ticked");
  assert.match(html, /<div role="status" class="snacks__cart-result"><p>Left out, no Amazon link yet: Oat Biscuits\.<\/p><p>Not added — it reads “Contains an allergen” now: Crunchy Peanut Bar\.<\/p><p class="card__meta">Amazon opens in a new tab/);
  assert.doesNotMatch(html, /<button|Open the Amazon cart|in the cart link/);
  // A result from an earlier selection never shows as the link while the next build is under way.
  assert.match(bar({ count: 3, busy: true, result: BUILT }), /<button type="button" class="button-primary" disabled="" aria-busy="true">Add 3 to Amazon cart<\/button><\/p><\/div>/);
  // Everything ticked refused: no link, the button stays disabled, the refused line says why.
  const refused = bar({ count: 1, result: { url: null, included: [], left_out: [], refused: [{ id: "i-2", name: "Crunchy Peanut Bar" }] } });
  assert.match(refused, /<button type="button" class="button-primary" disabled="">Add 1 to Amazon cart<\/button><\/p><div role="status" class="snacks__cart-result"><p>Not added — it reads “Contains an allergen” now: Crunchy Peanut Bar\.<\/p><\/div>/);
  assert.doesNotMatch(refused, /<a |Amazon opens in a new tab/);
  // A failure: the line, and the button live again to try once more.
  assert.match(bar({ count: 2, error: "Couldn't build the cart. Try again." }), /<button type="button" class="button-primary">Add 2 to Amazon cart<\/button><\/p><p role="alert">Couldn&#x27;t build the cart\. Try again\.<\/p><\/div>/);
  // Contains items never reach the link: the server's included list is all the link carries.
  const two = bar({ count: 2, result: { ...BUILT, url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07PGL2ZSL&Quantity.1=1&ASIN.2=B000000002&Quantity.2=1", included: [...BUILT.included, { id: "i-4", name: "Seed Bars", asin: "B000000002" }], left_out: [], refused: [] } });
  assert.match(two, /ASIN\.2=B000000002&amp;Quantity\.2=1" target="_blank" rel="noopener noreferrer">Add 2 to Amazon cart<\/a><\/p><div role="status" class="snacks__cart-result"><p class="card__meta">Amazon opens/);
});
