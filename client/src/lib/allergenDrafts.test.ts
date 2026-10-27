import assert from "node:assert/strict";
import { test } from "node:test";

import { canRemove, emptyDraft, removeDraft, removeLabel } from "./allergenDrafts";
import type { AllergenChoice } from "./api";

const choices: AllergenChoice[] = [
  { key: "peanut", displayName: "Peanut", group: "common", hint: null, spellings: [] },
];

test("Remove says which allergen it takes", () => {
  assert.equal(removeLabel({ key: "peanut", otherName: "" }, choices), "Remove Peanut");
  assert.equal(removeLabel({ key: "other", otherName: "  Lupin " }, choices), "Remove Lupin");
  assert.equal(removeLabel({ key: "", otherName: "" }, choices), "Remove this allergen");
  assert.equal(removeLabel({ key: "peanut", otherName: "" }, null), "Remove this allergen");
});

test("removing a row never moves another row's choices", () => {
  const [a, b, c] = [emptyDraft(), emptyDraft(), emptyDraft()];
  const drafts = [
    { ...a, pick: { key: "peanut", otherName: "" }, severity: "severe" as const },
    { ...b, pick: { key: "milk", otherName: "" }, severity: "mild" as const },
    { ...c, pick: { key: "egg", otherName: "" }, severity: "moderate" as const, treatTracesAsUnsafe: false },
  ];
  const left = removeDraft(drafts, b.id);
  assert.deepEqual(left, [drafts[0], drafts[2]]);
});

test("a lone row can be cleared once something is chosen, and the form keeps one row", () => {
  const lone = emptyDraft();
  assert.equal(canRemove(lone, 1), false);
  assert.equal(canRemove({ ...lone, pick: { key: "peanut", otherName: "" } }, 1), true);
  assert.equal(canRemove({ ...lone, severity: "mild" }, 1), true);
  assert.equal(canRemove(lone, 2), true);
  const after = removeDraft([{ ...lone, severity: "severe" }], lone.id);
  assert.equal(after.length, 1);
  assert.notEqual(after[0].id, lone.id);
  assert.equal(after[0].severity, null);
});
