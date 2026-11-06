import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScanHistoryEntry } from "./api";
import { SEVERE_ONLY_SHARED } from "./profileLineCopy";
import {
  allergenChips,
  circleReportsOffRows,
  circleReportsOnRow,
  LABEL_PROMISE,
  mayContainLine,
  profileInitial,
  recentCards,
  scanModes,
  scanStageOn,
  SCANS_ON_ITS_OWN,
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
  assert.equal(SCANS_ON_ITS_OWN, "It scans on its own. No button needed.");
});

const entry = (id: string, result: ScanHistoryEntry["original"]["result"], effective: ScanHistoryEntry["original"]["result"] | null, name: string | null): ScanHistoryEntry => ({
  id,
  barcode: "1",
  product_name: name,
  product_brand: null,
  created_at: "2026-11-06T00:00:00Z",
  original: { result, matched_allergens: [] },
  effective: effective ? { result: effective, matched_allergens: [] } : null,
  corrections: [],
  community_reports: [],
  pending_circle_reports: [],
});

test("Recent: up to three, the exact verdict label (the corrected view when there is one), each linking to its scan", () => {
  const cards = recentCards("p1", [
    entry("a", "safe", "contains_allergen", "Oat Biscuits"),
    entry("b", "safe", null, "Rice Crackers"),
    entry("c", "unable_to_confirm", null, null),
    entry("d", "safe", null, "Fourth"),
  ]);
  assert.deepEqual(cards.map((c) => c.label), ["Contains an allergen", "No listed allergens found", "Unable to confirm"]);
  assert.equal(cards[2]!.productName, "Unknown product");
  assert.equal(cards[0]!.href, "/profiles/p1/history#scan-a");
  for (const c of cards) assert.doesNotMatch(c.label, /\bsafe\b/i);
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

test("pending circle reports: on their row when one matches, else in the list; every report shows exactly once", () => {
  const reports = [{ allergenName: "Sesame" }, { allergenName: "peanut" }, { allergenName: "Peanuts" }];
  const rows = ["Peanut", "Milk"];
  const onRows = rows.flatMap((n) => circleReportsOnRow(reports, n));
  const off = circleReportsOffRows(reports, rows);
  assert.deepEqual(onRows.map((r) => r.allergenName), ["peanut"]);
  assert.deepEqual(off.map((r) => r.allergenName), ["Sesame", "Peanuts"], "a spelling no row matches stays in the list");
  assert.equal(onRows.length + off.length, reports.length);
});
