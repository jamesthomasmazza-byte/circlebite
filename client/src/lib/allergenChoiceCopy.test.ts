import assert from "node:assert/strict";
import { test } from "node:test";

import {
  confirmedListedAllergen,
  listedAllergenMessage,
  needsReviewLine,
  OTHER_WARNING,
  reviewNotice,
  spellingKey,
} from "./allergenChoiceCopy";
import type { AllergenChoice } from "./api";

const TREE_NUTS: AllergenChoice = {
  key: "tree-nut",
  displayName: "Tree nuts",
  group: "common",
  hint: "Matches any tree nut: almond, cashew, walnut and more.",
  spellings: ["treenut"],
};

test("a recognized spelling: says it already matches as the listed allergen, and offers to keep that", () => {
  const n = reviewNotice({ name: "treenuts", allergen_key: "tree-nut" }, TREE_NUTS);
  assert.equal(n.text, "We matched “treenuts” to Tree nuts, and scans now check for it that way.");
  assert.equal(n.hint, TREE_NUTS.hint);
  assert.equal(n.keepLabel, "Keep Tree nuts");
  assert.equal(n.chooseLabel, "Choose another");
});

test("a name the list doesn't have: says only what it matches, never claims more", () => {
  const n = reviewNotice({ name: "Ownertest", allergen_key: null }, undefined);
  assert.equal(n.text, "“Ownertest” isn't on our list. Scans look for that exact word only.");
  assert.equal(n.hint, null);
  assert.equal(n.keepLabel, "Keep it as typed");
  assert.equal(n.chooseLabel, "Choose from the list");
});

test("Other's warning says the word alone is matched, and to check labels", () => {
  assert.match(OTHER_WARNING, /exact word/);
  assert.match(OTHER_WARNING, /nothing else/);
  assert.match(OTHER_WARNING, /Check labels/);
});

test("listedAllergenMessage names the listed allergen, with or without the typed word", () => {
  assert.equal(listedAllergenMessage("treenuts", "Tree nuts"), "“treenuts” is on the list as Tree nuts. Choose Tree nuts from the list instead.");
  assert.match(listedAllergenMessage(null, "Tree nuts"), /^One of these is on the list as Tree nuts\./);
});

test("needsReviewLine agrees in number", () => {
  assert.equal(needsReviewLine("James Mazza's", 1), "1 allergen on James Mazza's profile needs a look.");
  assert.equal(needsReviewLine("your", 2), "2 allergens on your profile need a look.");
});

// The server's own spellingKey cases (server matcher/allergenChoices.test.ts): the copy must agree.
test("spellingKey agrees with the server's on its cases", () => {
  assert.equal(spellingKey("treenuts"), "treenut");
  assert.equal(spellingKey("Tree-Nuts"), "treenut");
  assert.equal(spellingKey("tree nut"), "treenut");
  assert.equal(spellingKey("Brazilnuts"), "brazilnut");
  assert.equal(spellingKey("s"), "s");
  assert.equal(spellingKey(" Eggs "), "egg");
});

const LISTED: AllergenChoice[] = [
  { ...TREE_NUTS, spellings: ["treenut"] },
  { key: "peanut", displayName: "Peanut", group: "common", hint: null, spellings: ["peanut", "groundnut"] },
  { key: "walnut", displayName: "Walnut", group: "single_nut", hint: null, spellings: ["walnut"] },
];

test("confirmedListedAllergen: only a rename to the listed name of what it already was", () => {
  assert.equal(confirmedListedAllergen("treenuts", "Tree nuts", LISTED)?.key, "tree-nut");
  assert.equal(confirmedListedAllergen("groundnuts", "Peanut", LISTED)?.key, "peanut");
  assert.equal(confirmedListedAllergen("Peanut", "Walnut", LISTED), undefined, "a different allergen");
  assert.equal(confirmedListedAllergen("treenuts", "Tree nutz", LISTED), undefined, "not a listed name");
});
