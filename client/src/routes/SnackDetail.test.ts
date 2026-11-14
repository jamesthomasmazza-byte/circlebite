import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import type { MatchedAllergen, SnackItem } from "../lib/api";
import { SnackDetailView } from "./SnackDetail";

// One item's detail page (JT's mockup, Nov 14; /snacks/:itemId, behind SNACK_LIST).

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

const noop = async () => {};
const inRouter = (el: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

type DetailProps = Parameters<typeof SnackDetailView>[0];
const renderDetail = (i: SnackItem, canManage = true, extra: Partial<DetailProps> = {}) =>
  inRouter(createElement(SnackDetailView, { item: i, profile: MAYA, canManage, onSaveNote: noop, onLinkAmazon: noop, onRemove: noop, ...extra }));

test("the detail page: the large photo, name, brand and barcode, the verdict block with the headline and every allergen checked, the note, the arrives line, then the actions", () => {
  const html = renderDetail(MAY);
  assert.match(html, /^<article class="snack-detail__item" data-verdict="may_contain_caution"><span class="product-photo product-photo--detail product-photo--empty"/);
  assert.match(html, /<h1 class="snack-detail__name">Oat Biscuits<\/h1><p class="snack-detail__product card__meta"><span class="card__line">Fernhallow<\/span><span class="card__line">2990000000014<\/span><\/p>/);
  assert.match(html, /<section class="snack-detail__verdict" aria-label="Verdict"><p class="verdict-card__headline">May contain — caution<\/p><p class="snack-detail__checked card__meta">Checked for<\/p><ul class="history-entry__rows"><li>Peanut \(severe\) — not found in the data<\/li><li>Sesame \(moderate\) — may contain traces<\/li><\/ul><\/section>/);
  assert.match(html, /<p class="snack-item__note">For playdates<\/p>/);
  assert.match(html, /<p class="card__meta snack-detail__arrives">Scan it when it arrives — stores can send a different version\. Screening aid, not a guarantee\.<\/p>/);
  assert.match(html, /<div class="snack-detail__actions"><a class="button-link button-link--primary" href="https:\/\/www\.amazon\.com\/s\?k=[^"]+" target="_blank" rel="noopener noreferrer">Shop on Amazon<\/a><a class="button-link" href="https:\/\/www\.instacart\.com\/store\/s\?k=[^"]+" target="_blank" rel="noopener noreferrer">Shop on Instacart<\/a><p class="snack-item__actions"><button type="button">Edit note<\/button><button type="button">Remove from list<\/button><\/p><\/div>/);
  assert.doesNotMatch(text(html), /\bsafe\b/i);
  assert.match(renderDetail(item({})), /<button type="button">Add a note<\/button>/);
});

test("carts on: an unlinked item's primary action is Link on Amazon (the search, new tab); linked, Shop on Amazon to the product with the linked-by line and a small Change Amazon link", () => {
  const unlinked = renderDetail(item({}), true, { cartsEnabled: true });
  assert.match(unlinked, /<a class="button-link button-link--primary" href="https:\/\/www\.amazon\.com\/s\?k=[^"]+" target="_blank" rel="noopener noreferrer">Link on Amazon<\/a>/);
  assert.doesNotMatch(unlinked, /Change Amazon link|Amazon link added/);
  const linked = renderDetail(item({ amazon: LINKED, shop: { amazon: "https://www.amazon.com/dp/B07PGL2ZSL", instacart: "https://www.instacart.com/store/s?k=x", affiliate: false } }), true, { cartsEnabled: true });
  assert.match(linked, /<p class="card__meta snack-item__amazon">Amazon link added by Grandma, Nov 13<\/p>/);
  assert.match(linked, /href="https:\/\/www\.amazon\.com\/dp\/B07PGL2ZSL"[^>]*>Shop on Amazon</);
  assert.match(linked, /<button type="button">Add a note<\/button><button type="button" class="link-button">Change Amazon link<\/button><button type="button">Remove from list<\/button>/);
  assert.doesNotMatch(linked, /Link on Amazon/);
});

test("a Contains item: no shop or link actions, the correction link instead, and still the note and remove for a manager", () => {
  const html = renderDetail(CONTAINS, true, { cartsEnabled: true });
  assert.match(html, /verdict-card__headline">Contains an allergen</);
  assert.match(html, /Peanut \(severe\) — contains/);
  assert.doesNotMatch(html, /Shop on|Link on Amazon|amazon\.com|instacart\.com/);
  assert.match(html, /<a href="\/scan\?profile=p-maya&amp;snack=i-2"[^>]*>Label wrong\? Report a correction<\/a>/);
  assert.match(html, /Remove from list/);
});

test("a follower reads: the shop links, no note, remove or link controls", () => {
  const html = renderDetail(item({ note: "For playdates", amazon: LINKED }), false, { cartsEnabled: true });
  assert.match(html, /Shop on Amazon/);
  assert.match(html, /<p class="snack-item__note">For playdates<\/p>/);
  assert.doesNotMatch(html, /Add a note|Edit note|Remove from list|Change Amazon link|Link on Amazon|Remove link/);
});

test("a circle report that changed the verdict is named on the detail page, with the engine's own verdict alongside", () => {
  const html = renderDetail(
    item({
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

test("a no-allergen profile's detail page has no verdict block and no verdict colour; the rest stands", () => {
  const html = renderDetail(CONTAINS, true, { plain: true });
  assert.match(html, /^<article class="snack-detail__item"><span class="product-photo/);
  assert.doesNotMatch(html, /snack-detail__verdict|Checked for|Contains an allergen|data-verdict/);
  assert.match(html, /Crunchy Peanut Bar/);
  assert.match(html, /Scan it when it arrives/);
});

const DETAIL = readFileSync(new URL("./SnackDetail.tsx", import.meta.url), "utf8");

test("the detail route reads the same list call as the tab (the same access rules), takes the shell's chosen profile, and goes back to the list after a remove", () => {
  assert.match(DETAIL, /const \{ itemId = "" \} = useParams\(\);/);
  assert.match(DETAIL, /getSnackList\(profile\.id\)/);
  assert.match(DETAIL, /const \{ chosenProfileId, profiles, profilesLoaded \} = useScanningFor\(\);/);
  assert.match(DETAIL, /<Link to=\{snacksPath\(profile\.id\)\}>← \{listTitle\(profile\)\}<\/Link>/);
  assert.match(DETAIL, /navigate\(snacksPath\(profile\.id\), \{ replace: true \}\);/);
  assert.match(DETAIL, /if \(!loading && !snackListEnabled\) \{/);
  assert.match(DETAIL, /\{list && !item && <p role="status">\{ITEM_GONE\}<\/p>\}/);
});

test("the detail photo: the full image, no referrer, not lazy; the small one when that's all there is; the placeholder with none", () => {
  const both = renderDetail(item({ product: { name: "Plain Rice Crackers", brand: "Hearthfield", image_small: "https://images.openfoodfacts.org/x.200.jpg", image: "https://images.openfoodfacts.org/x.400.jpg" } }));
  assert.match(both, /<img class="product-photo product-photo--detail" src="https:\/\/images\.openfoodfacts\.org\/x\.400\.jpg" alt="" referrer[Pp]olicy="no-referrer" decoding="async"\/>/);
  assert.match(renderDetail(item({ product: { name: "Plain Rice Crackers", brand: "Hearthfield", image_small: "https://images.openfoodfacts.org/x.200.jpg" } })), /src="https:\/\/images\.openfoodfacts\.org\/x\.200\.jpg"/);
  assert.match(renderDetail(item({})), /product-photo--detail product-photo--empty/);
});

const PHOTO = readFileSync(new URL("../ProductPhoto.tsx", import.meta.url), "utf8");

test("an image that fails to load gives way to the placeholder, and a new src gets a fresh try", () => {
  assert.match(PHOTO, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(PHOTO, /if \(src && !failed\) \{/);
  assert.match(PHOTO, /useEffect\(\(\) => setFailed\(false\), \[src\]\);/);
  assert.match(PHOTO, /referrerPolicy="no-referrer"/);
});
