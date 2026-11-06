import assert from "node:assert/strict";
import { test } from "node:test";

import { SEVERE_ONLY_SHARED } from "./profileLineCopy";
import {
  allergenChips,
  circleReportsOnRow,
  LABEL_PROMISE,
  mayContainLine,
  profileInitial,
  scanModes,
  scanStageOn,
  traceName,
} from "./scanRedesign";

// The redesigned Scan tab's own rules (JT, 2026-11-06, behind SCAN_REDESIGN).

test("Scan's pill replaces the header on Scan only, and only with the switch", () => {
  assert.equal(scanStageOn(true, true), true);
  assert.equal(scanStageOn(true, false), false, "every other screen keeps the header");
  assert.equal(scanStageOn(false, true), false, "switch off: today's Scan");
  assert.equal(profileInitial("maya"), "M");
});

test("chips follow the profile line exactly: names only, three then more, never \"no allergens\" for severe-only", () => {
  assert.deepEqual(allergenChips({ allergen_names: ["Peanut", "Sesame", "Egg", "Milk"], share_level: undefined }), {
    names: ["Peanut", "Sesame", "Egg"],
    more: 1,
    empty: null,
  });
  // A severe-only follower is sent the severe names only (server routes/profiles.ts).
  assert.deepEqual(allergenChips({ allergen_names: ["Peanut"], share_level: "severe_only" }).names, ["Peanut"]);
  const severeEmpty = allergenChips({ allergen_names: [], share_level: "severe_only" });
  assert.equal(severeEmpty.empty, SEVERE_ONLY_SHARED);
  assert.doesNotMatch(severeEmpty.empty!, /no allergens/i);
  assert.equal(allergenChips({ allergen_names: [], share_level: undefined }).empty, "No allergens on this profile yet");
});

test("the segmented control: Label photo only with LABEL_SCAN; Type it always (the judge card's typed barcode)", () => {
  assert.deepEqual(scanModes(true).map((m) => m.label), ["Barcode", "Label photo", "Type it"]);
  assert.deepEqual(scanModes(false).map((m) => m.label), ["Barcode", "Type it"]);
});

test("the may-contain line: nothing without a record, \"None on the product record\" for an empty list", () => {
  assert.equal(mayContainLine(null), null, "no record to speak for: not on file, or the lookup failed");
  assert.equal(mayContainLine(undefined), null, "a photo result");
  assert.equal(mayContainLine([]), "None on the product record. Check the package.");
  assert.equal(mayContainLine(["en:nuts", "en:sesame-seeds"]), "May contain, on the product record: nuts, sesame seeds.");
  assert.equal(traceName("fr:fruits-a-coque"), "fruits a coque");
  assert.doesNotMatch(mayContainLine([])!, /\bsafe\b/i);
});

test("the label photo's promise, true per extractLabel's legible and complete", () => {
  assert.equal(LABEL_PROMISE, "If any part is cut off or hard to read, we'll ask for another photo instead of guessing.");
});

test("pending circle reports: each on the row its allergen names, by spelling as the card does", () => {
  const reports = [{ allergenName: "Sesame" }, { allergenName: "peanut" }, { allergenName: "Peanuts" }];
  assert.deepEqual(circleReportsOnRow(reports, "Peanut").map((r) => r.allergenName), ["peanut"]);
  assert.deepEqual(circleReportsOnRow(reports, "Milk"), []);
});
