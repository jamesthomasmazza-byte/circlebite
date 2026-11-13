import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addButtonLabel,
  addedLine,
  alreadyListedLine,
  approvedBy,
  confirmHeading,
  confirmLine,
  emptyLine,
  listTitle,
  needsConfirm,
  shortDate,
  snacksPath,
  warnedAllergens,
} from "./snackListCopy";

const MAYA = { label: "Maya", is_self: false };
const ME = { label: "James", is_self: true };

test("the list and the button are named for the person, and say 'your' for the account holder's own", () => {
  assert.equal(listTitle(MAYA), "Maya's snacks");
  assert.equal(listTitle(ME), "Your snacks");
  assert.equal(addButtonLabel(MAYA), "Add to Maya's snacks");
  assert.equal(addButtonLabel(ME), "Add to your snacks");
  assert.equal(addedLine(MAYA), "Added to Maya's snacks.");
  assert.equal(alreadyListedLine(MAYA), "Already on Maya's snacks.");
});

test("Contains and May contain need a confirm step; the other two verdicts don't", () => {
  assert.equal(needsConfirm("contains_allergen"), true);
  assert.equal(needsConfirm("may_contain_caution"), true);
  assert.equal(needsConfirm("safe"), false);
  assert.equal(needsConfirm("unable_to_confirm"), false);
});

test("the confirm step says what the warning is: the verdict's own label and the allergens it names", () => {
  const rows = [
    { allergenName: "Peanut", classification: "contains" as const },
    { allergenName: "Sesame", classification: "caution" as const },
    { allergenName: "Milk", classification: "clear" as const },
  ];
  assert.deepEqual(warnedAllergens(rows), ["Peanut", "Sesame"]);
  assert.equal(confirmHeading("contains_allergen"), "This product reads “Contains an allergen”");
  assert.equal(confirmHeading("may_contain_caution"), "This product reads “May contain — caution”");
  const line = confirmLine(MAYA, "contains_allergen", ["Peanut"]);
  assert.match(line, /^Its data says it contains an allergen for Maya: Peanut\./);
  assert.match(line, /stays on the list for good/);
  assert.match(line, /Add it anyway\?$/);
  assert.match(confirmLine(ME, "may_contain_caution", ["Sesame"]), /may contain an allergen for you: Sesame\./);
});

test("never the word 'safe'", () => {
  for (const s of [listTitle(MAYA), addButtonLabel(MAYA), confirmLine(MAYA, "contains_allergen", ["Peanut"]), emptyLine(MAYA, true), emptyLine(MAYA, false)]) {
    assert.doesNotMatch(s, /\bsafe\b/i, s);
  }
});

test("the empty state tells a manager how to add, and a follower only that it's empty", () => {
  assert.equal(emptyLine(MAYA, true), "Nothing on Maya's list yet. Scan a product, then tap “Add to Maya's snacks” on its card.");
  assert.equal(emptyLine(MAYA, false), "Nothing on Maya's list yet.");
});

test("'Approved by <name>, <date>', and 'Approved <date>' when the approver's account is gone", () => {
  assert.equal(approvedBy("James", "Nov 13"), "Approved by James, Nov 13");
  assert.equal(approvedBy(null, "Nov 13"), "Approved Nov 13");
});

test("the date is short, with the year only when it isn't this one", () => {
  const now = new Date("2026-11-13T20:00:00Z");
  assert.equal(shortDate("2026-11-13T15:00:00Z", now, { locale: "en-US", timeZone: "America/New_York" }), "Nov 13");
  assert.equal(shortDate("2025-12-24T15:00:00Z", now, { locale: "en-US", timeZone: "America/New_York" }), "Dec 24, 2025");
});

test("the list's path carries the profile, which the shell takes as its choice", () => {
  assert.equal(snacksPath("abc"), "/snacks?profile=abc");
});
