import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SnackSearchView, type MoreState } from "./SnackSearch";
import { MORE_BUSY, MORE_UNAVAILABLE } from "./lib/snackSearch";

// The search box on the Snacks tab (docs/snack-list-plan.md addendum, 2026-11-14; behind SNACK_SEARCH).

const MAYA = { id: "p-maya", label: "Maya", is_self: false };
const CRACKERS = { barcode: "2990000000014", name: "Plain Rice Crackers", brand: "Hearthfield" };
const PRETZELS = { barcode: "0096619336753", name: "Peanut Butter Pretzels", brand: "Kirkland Signature" };
const noop = () => {};

function render(over: Partial<Parameters<typeof SnackSearchView>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(SnackSearchView, {
      profile: MAYA,
      query: "",
      onQueryChange: noop,
      onSubmit: noop,
      searching: false,
      error: null,
      searched: null,
      local: null,
      more: { kind: "idle" } as MoreState,
      onMore: noop,
      onPick: noop,
      ...over,
    }),
  );
}

test("before a search: the labelled search field and its button, nothing else", () => {
  const html = render();
  assert.match(html, /<label>Search for a product<input type="search"[^>]*placeholder="Name or brand"/);
  assert.match(html, /<button type="submit">Search<\/button>/);
  assert.doesNotMatch(html, /Search more|snack-search__results/);
});

test("results are buttons with the product and its barcode, never a verdict and never a link; the pick line names the profile; Search more is offered", () => {
  const html = render({ searched: "crackers", local: [CRACKERS] });
  assert.match(html, /<button type="button" class="snack-search__result"><span class="snack-search__title">Plain Rice Crackers — Hearthfield<\/span><small class="snack-search__barcode">2990000000014<\/small><\/button>/);
  assert.doesNotMatch(html, /<a /, "a link would carry the barcode in a URL");
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\bsafe\b|Contains an allergen|May contain|Unable to confirm/i);
  assert.match(html, /Tap a product to scan it for Maya\. A result isn&#x27;t checked until it&#x27;s opened, and nothing goes on the list by itself\./);
  assert.match(html, /<button type="button">Search more<\/button>/);
});

test("no local match: Open Food Facts is asked at once (JT, Nov 14) — only the waiting line while it's asked, then its results, or one line that nothing matched anywhere", () => {
  const waiting = render({ searched: "zucchini chips", local: [], more: { kind: "loading" } });
  assert.match(waiting, /Asking Open Food Facts…/);
  assert.doesNotMatch(waiting, /Nothing called|Search more/);
  const found = render({ searched: "zucchini chips", local: [], more: { kind: "done", results: [PRETZELS] } });
  assert.match(found, /More from Open Food Facts/);
  assert.match(found, /Peanut Butter Pretzels/);
  assert.doesNotMatch(found, /Nothing called/);
  const none = render({ searched: "zucchini chips", local: [], more: { kind: "done", results: [] } });
  assert.match(none, /Nothing called “zucchini chips” in this app&#x27;s records or on Open Food Facts\./);
  assert.doesNotMatch(none, /More from Open Food Facts|no match either|Tap a product/);
  const failed = render({ searched: "zucchini chips", local: [], more: { kind: "failed", line: MORE_UNAVAILABLE } });
  assert.match(failed, /Nothing called “zucchini chips” among the products this app has seen\./);
  assert.match(failed, /Couldn&#x27;t reach Open Food Facts right now\./);
  assert.doesNotMatch(failed, /Search more/, "no tap to offer: the ask already ran");
});

test("with local results, Search more stays a tap away", () => {
  const html = render({ searched: "crackers", local: [CRACKERS] });
  assert.match(html, /<button type="button">Search more<\/button>/);
  assert.doesNotMatch(html, /Asking Open Food Facts/);
});

test("Search more: loading, then its results under their own heading, or that Open Food Facts has none either", () => {
  const waiting = render({ searched: "peanut", local: [CRACKERS], more: { kind: "loading" } });
  assert.match(waiting, /<p role="status" aria-busy="true" class="snack-search__more snack-search__waiting">Asking Open Food Facts…<\/p>/);
  assert.doesNotMatch(waiting, /Search more</, "the button is gone while it waits, so a tap isn't repeated");
  const done = render({ searched: "peanut", local: [CRACKERS], more: { kind: "done", results: [PRETZELS] } });
  assert.match(done, /<h3 class="snack-search__heading">More from Open Food Facts<\/h3>/);
  assert.match(done, /Peanut Butter Pretzels — Kirkland Signature/);
  assert.doesNotMatch(done, /<button type="button">Search more<\/button>/, "offered once per search");
  assert.match(render({ searched: "peanut", local: [CRACKERS], more: { kind: "done", results: [] } }), /Open Food Facts has no match either\./);
});

test("a Search more failure is said as what it is, in a status line, and the local results stay", () => {
  const html = render({ searched: "peanut", local: [CRACKERS], more: { kind: "failed", line: MORE_UNAVAILABLE } });
  assert.match(html, /<p role="status" class="snack-search__more">Couldn&#x27;t reach Open Food Facts right now\./);
  assert.match(html, /Plain Rice Crackers/);
  assert.match(render({ searched: "p", local: [], more: { kind: "failed", line: MORE_BUSY } }), /busy right now/);
});

test("an error on the search itself is an alert; while searching the button says so and is disabled", () => {
  assert.match(render({ error: "Type at least two characters." }), /<p role="alert">Type at least two characters\.<\/p>/);
  assert.match(render({ searching: true }), /<button type="submit" disabled="">Searching…<\/button>/);
});

// The stateful component: what it calls and where a tap goes.
const SOURCE = readFileSync(new URL("./SnackSearch.tsx", import.meta.url), "utf8");

test("a tap navigates to Scan for the profile with the barcode in location state, never in the path; Search more drops barcodes already shown", () => {
  assert.match(SOURCE, /navigate\(scanPathFor\(profile\.id\), \{ state: scanStateFor\(result\.barcode\) \}\)/);
  assert.doesNotMatch(SOURCE, /barcode=/, "no barcode query parameter");
  assert.match(SOURCE, /r\.results\.filter\(\(x\) => !shown\.has\(x\.barcode\)\)/);
  assert.match(SOURCE, /if \(found && searchedQuery && found\.length === 0\) await searchMore\(searchedQuery, found\);/, "no local match asks Open Food Facts at once, through the same limited route");
  assert.match(SOURCE, /const r = await searchSnacksMore\(query\);/);
  assert.match(SOURCE, /moreFailureLine\(err instanceof ApiRequestError \? err\.message : ""\)/);
});
