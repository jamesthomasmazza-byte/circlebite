import assert from "node:assert/strict";
import { test } from "node:test";

import { accessNotice, allergenLine, headerProfileName, profileOptionText, SEVERE_ONLY_SHARED } from "./profileLineCopy";

test("the line names up to three allergens, then how many more", () => {
  assert.equal(allergenLine({ allergen_names: ["Peanut"] }), "Peanut");
  assert.equal(allergenLine({ allergen_names: ["Milk", "Peanut", "Sesame"] }), "Milk, Peanut, Sesame");
  assert.equal(allergenLine({ allergen_names: ["Egg", "Milk", "Peanut", "Sesame", "Soy"] }), "Egg, Milk, Peanut +2 more");
});

test("an empty line says why: a profile with none, or a follower shown severe ones only", () => {
  assert.equal(allergenLine({ allergen_names: [] }), "No allergens on this profile yet");
  assert.equal(allergenLine({ allergen_names: [], share_level: "all" }), "No allergens on this profile yet");
  // Never "no allergens" to a severe_only follower — milder ones may exist and weren't sent.
  assert.equal(allergenLine({ allergen_names: [], share_level: "severe_only" }), "Only severe allergens are shared with you");
});

test("two same-named profiles are told apart by their allergens", () => {
  const maya = { id: "a", label: "Maya", allergen_names: ["Peanut"], relationship: "owner" as const };
  const otherMaya = { id: "b", label: "Maya", allergen_names: ["Milk"] };
  assert.equal(profileOptionText(maya, [maya, otherMaya]), "Maya · Peanut");
});

test("when name and allergens both match, how you hold each one is added", () => {
  const mine = { id: "a", label: "Maya", allergen_names: ["Peanut"], relationship: "owner" as const };
  const coManaged = { id: "b", label: "Maya", allergen_names: ["Peanut"], relationship: "co_manager" as const };
  const followed = { id: "c", label: "Maya", allergen_names: ["Peanut"], share_level: "all" as const };
  const all = [mine, coManaged, followed];
  assert.equal(profileOptionText(mine, all), "Maya · Peanut (you own)");
  assert.equal(profileOptionText(coManaged, all), "Maya · Peanut (co-manager)");
  assert.equal(profileOptionText(followed, all), "Maya · Peanut (you follow)");
});

test("the header adds how you hold a profile only when another one has the same name", () => {
  const coManaged = { id: "a", label: "Maya", relationship: "co_manager" as const };
  const followed = { id: "b", label: "Maya" };
  const noor = { id: "c", label: "Noor" };
  assert.equal(headerProfileName(coManaged, [coManaged, followed, noor]), "Maya (co-manager)");
  assert.equal(headerProfileName(followed, [coManaged, followed, noor]), "Maya (you follow)");
  assert.equal(headerProfileName(noor, [coManaged, followed, noor]), "Noor");
  assert.equal(headerProfileName(coManaged, [coManaged, noor]), "Maya");
});

// The profile page's access line (JT, 2026-11-05): gone, except for a severe_only follower, whose
// list is filtered and must never read as the whole list.
test("accessNotice: only a severe-only follower is told anything, in the Profile tab's words", () => {
  assert.equal(accessNotice({ level: "follower", shareLevel: "severe_only" }), "Only severe allergens are shared with you.");
  assert.equal(accessNotice({ level: "follower", shareLevel: "all" }), null);
  assert.equal(accessNotice({ level: "owner" }), null);
  assert.equal(accessNotice({ level: "co_manager" }), null);
  assert.equal(allergenLine({ allergen_names: [], share_level: "severe_only" }), SEVERE_ONLY_SHARED);
});
