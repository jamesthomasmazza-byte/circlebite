import assert from "node:assert/strict";
import { test } from "node:test";

import * as copy from "./snackSearch";
import { moreFailureLine, pickedBarcode, pickLine, resultTitle, scanPathFor, scanStateFor } from "./snackSearch";

// Snack search's words and its hand-off to Scan (docs/snack-list-plan.md addendum, 2026-11-14).

test("never the word 'safe', and never a verdict word, in any of the copy", () => {
  for (const [name, value] of Object.entries(copy)) {
    if (typeof value === "string") assert.doesNotMatch(value, /\bsafe\b|\bcontains\b|\bmay contain\b/i, name);
  }
  assert.doesNotMatch(pickLine({ label: "Maya", is_self: false }), /\bsafe\b/i);
});

test("the pick line names who the scan is for, and that nothing is added by itself", () => {
  assert.equal(
    pickLine({ label: "Maya", is_self: false }),
    "Tap a product to scan it for Maya. A result isn't checked until it's opened, and nothing goes on the list by itself.",
  );
  assert.match(pickLine({ label: "JT", is_self: true }), /scan it for you\./);
});

test("a result's title: name and brand, or whichever there is, or Unnamed product", () => {
  assert.equal(resultTitle({ name: "Crunchy Peanut Bar", brand: "Hearthfield" }), "Crunchy Peanut Bar — Hearthfield");
  assert.equal(resultTitle({ name: "Crunchy Peanut Bar", brand: null }), "Crunchy Peanut Bar");
  assert.equal(resultTitle({ name: null, brand: "Loacker" }), "Loacker");
  assert.equal(resultTitle({ name: null, brand: null }), "Unnamed product");
});

test("each Search more failure is said as what it is", () => {
  assert.equal(moreFailureLine("search_limit"), copy.MORE_LIMIT);
  assert.equal(moreFailureLine("search_busy"), copy.MORE_BUSY);
  assert.equal(moreFailureLine("search_unavailable"), copy.MORE_UNAVAILABLE);
  assert.equal(moreFailureLine("request_failed_500"), copy.SEARCH_FAILED);
  assert.doesNotMatch(copy.MORE_UNAVAILABLE, /no match|nothing/i, "a failure never reads as 'nothing matched'");
  assert.equal(copy.nothingAnywhereLine("zucchini chips"), "Nothing called “zucchini chips” in this app's records or on Open Food Facts.");
});

test("the hand-off: the path carries only the profile; the barcode rides in location state and is read back only when it looks like one", () => {
  assert.equal(scanPathFor("5eed0002-0000-0000-0000-000000000001"), "/scan?profile=5eed0002-0000-0000-0000-000000000001");
  assert.doesNotMatch(scanPathFor("p1"), /\d{6,}/, "never a barcode in the URL");
  const state = scanStateFor("2990000000014");
  assert.equal(pickedBarcode(state), "2990000000014");
  assert.equal(pickedBarcode(null), null);
  assert.equal(pickedBarcode(undefined), null);
  assert.equal(pickedBarcode("2990000000014"), null);
  assert.equal(pickedBarcode({ snackSearchBarcode: "12345" }), null, "too short");
  assert.equal(pickedBarcode({ snackSearchBarcode: "abc" }), null);
  assert.equal(pickedBarcode({ other: "2990000000014" }), null);
});
