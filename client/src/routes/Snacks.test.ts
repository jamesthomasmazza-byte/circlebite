import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import type { MatchedAllergen, SnackItem } from "../lib/api";
import { SnackCartPanel, SnackItemCard } from "./Snacks";

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
type CardProps = Parameters<typeof SnackItemCard>[0];
function render(i: SnackItem, canManage = true, extra: Partial<CardProps> = {}): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(SnackItemCard, { item: i, profile: MAYA, canManage, onRemove: noop, onSaveNote: noop, ...extra })),
  );
}
const carts: Partial<CardProps> = { cartsEnabled: true, onToggle: () => {}, onLinkAmazon: noop };

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

test("the search box (SNACK_SEARCH) sits above the list only while its own switch is on", () => {
  assert.match(PAGE, /const \{ snackListEnabled, snackSearchEnabled, snackCartsEnabled, loading \} = useAuth\(\);/);
  assert.match(PAGE, /\{snackSearchEnabled && <SnackSearch profile=\{profile\} \/>\}/);
  const box = PAGE.indexOf("<SnackSearch");
  const list = PAGE.indexOf('className="card-list snacks__list"');
  assert.ok(box > 0 && box < list, "the box comes before the list");
});

// ---- Carts (the addendum's part B, 2026-11-14; behind SNACK_CARTS) ----

test("with carts off (the default) nothing of part B is drawn", () => {
  const html = render(item({ amazon: { asin: "B07PGL2ZSL", linked_by: "Grandma", linked_at: "2026-11-13T16:00:00Z" } }));
  assert.doesNotMatch(html, /checkbox|Link on Amazon|Amazon link added|Amazon cart/);
});

test("carts on: an item with shop links gets a checkbox named for the product; a manager gets Link on Amazon; a follower gets the checkbox only", () => {
  const manager = render(item({}), true, carts);
  assert.match(manager, /<input type="checkbox" aria-label="Select Plain Rice Crackers for the Amazon cart"\/>/);
  assert.match(manager, /<button type="button">Link on Amazon<\/button>/);
  assert.doesNotMatch(manager, /Amazon link added|Remove Amazon link/);
  const follower = render(item({}), false, carts);
  assert.match(follower, /aria-label="Select Plain Rice Crackers for the Amazon cart"/);
  assert.doesNotMatch(follower, /Link on Amazon/);
  assert.match(render(item({}), true, { ...carts, selected: true }), /<input type="checkbox" aria-label="[^"]+" checked=""/);
});

test("a linked item says who linked it and when, Shop on Amazon is the server's product link, and the manager may change or remove the link", () => {
  const html = render(
    item({
      amazon: { asin: "B07PGL2ZSL", linked_by: "Grandma", linked_at: "2026-11-13T16:00:00Z" },
      shop: { amazon: "https://www.amazon.com/dp/B07PGL2ZSL", instacart: "https://www.instacart.com/store/s?k=x", affiliate: false },
    }),
    true,
    carts,
  );
  assert.match(html, /<p class="card__meta snack-item__amazon">Amazon link added by Grandma, Nov 13<\/p>/);
  assert.match(html, /href="https:\/\/www\.amazon\.com\/dp\/B07PGL2ZSL"[^>]*>Shop on Amazon</);
  assert.match(html, /<button type="button">Change Amazon link<\/button><button type="button">Remove Amazon link<\/button>/);
  assert.match(render(item({ amazon: { asin: "B07PGL2ZSL", linked_by: null, linked_at: "2026-11-13T16:00:00Z" } }), true, carts), /Amazon link added Nov 13</);
});

test("a Contains item, which the server sends without shop links, gets no checkbox and no Link on Amazon even with carts on", () => {
  const html = render(
    item({ original: { result: "contains_allergen", matched_allergens: [row("Peanut", { matched: true, source: "tag", classification: "contains" })] }, headline: "contains_allergen", shop: null }),
    true,
    carts,
  );
  assert.doesNotMatch(html, /checkbox|Link on Amazon|Amazon cart/);
});

function panel(over: Partial<Parameters<typeof SnackCartPanel>[0]> = {}): string {
  return renderToStaticMarkup(createElement(SnackCartPanel, { count: 0, busy: false, result: null, error: null, onBuild: () => {}, ...over }));
}

test("the cart panel: the button counts the selection and is disabled with none; building says so", () => {
  assert.match(panel(), /<button type="button" class="button-primary" disabled="">Add selected to Amazon cart<\/button>/);
  assert.match(panel({ count: 2 }), /<button type="button" class="button-primary">Add selected to Amazon cart \(2\)<\/button>/);
  assert.match(panel({ count: 2, busy: true }), /disabled="">Building the cart…</);
  assert.match(panel({ error: "Couldn't build the cart. Try again." }), /<p role="alert">Couldn&#x27;t build the cart\. Try again\.<\/p>/);
});

test("the cart panel's result: the one link in a new tab, who went in, who was left out and why, who was refused and why, and the standing note", () => {
  const html = panel({
    count: 3,
    result: {
      url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07PGL2ZSL&Quantity.1=1",
      included: [{ id: "i-1", name: "Plain Rice Crackers", asin: "B07PGL2ZSL" }],
      left_out: [{ id: "i-2", name: "Oat Biscuits" }],
      refused: [{ id: "i-3", name: "Crunchy Peanut Bar" }],
    },
  });
  assert.match(html, /<div role="status" class="snacks__cart-result"><p>1 item is in the cart link\.<\/p>/);
  assert.match(html, /<a class="button-link" href="https:\/\/www\.amazon\.com\/gp\/aws\/cart\/add\.html\?ASIN\.1=B07PGL2ZSL&amp;Quantity\.1=1" target="_blank" rel="noopener noreferrer">Open the Amazon cart<\/a>/);
  assert.match(html, /Left out, no Amazon link yet: Oat Biscuits\./);
  assert.match(html, /Not added — it reads “Contains an allergen” now: Crunchy Peanut Bar\./);
  assert.match(html, /Amazon opens in a new tab with these items in its add-to-cart step; sign in there to finish\. Scan each item when it arrives\./);
  const nothing = panel({ count: 1, result: { url: null, included: [], left_out: [], refused: [{ id: "i-3", name: "Crunchy Peanut Bar" }] } });
  assert.match(nothing, /Nothing could go in the cart\./);
  assert.doesNotMatch(nothing, /Open the Amazon cart|sign in there/);
});

test("the page builds the cart on the server from the ticked ids, clears the selection when the profile changes, and shows the panel only with carts on and something to shop for", () => {
  assert.match(PAGE, /setCartResult\(await buildSnackCart\(profile!\.id, \[\.\.\.selected\]\)\)/);
  assert.match(PAGE, /useEffect\(\(\) => \{\n\s+setSelected\(new Set\(\)\);[\s\S]*?\}, \[profile\?\.id\]\);/);
  assert.match(PAGE, /\{snackCartsEnabled && shoppable\.length > 0 && \(\s*<SnackCartPanel/);
  assert.doesNotMatch(PAGE, /cart\/add\.html/, "the client never assembles a cart link itself");
});

test("an empty list: a manager sees only the search box; a follower's line is unchanged (JT, Nov 14)", () => {
  assert.match(PAGE, /\{list && list\.items\.length === 0 && !canManage && <p className="snacks__empty">\{emptyLine\(profile, false\)\}<\/p>\}/);
  assert.doesNotMatch(PAGE, /EMPTY_SCAN_LINK|Scan a product/);
});
