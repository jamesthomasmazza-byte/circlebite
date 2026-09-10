import assert from "node:assert/strict";
import { test } from "node:test";

import type { AllergenVerdictDetail } from "../matcher/match.js";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt.js";
import type { ProfileAllergen } from "./types.js";

const ALLERGENS: ProfileAllergen[] = [
  { name: "Milk", severity: "severe", treatTracesAsUnsafe: true },
  { name: "Peanut", severity: "moderate", treatTracesAsUnsafe: false },
];

const DETERMINISTIC_HITS: AllergenVerdictDetail[] = [
  { allergenName: "Milk", matched: true, source: "ingredients", severity: "severe", classification: "contains" },
  { allergenName: "Peanut", matched: false, source: null, severity: "moderate", classification: "clear" },
];

test("PROMPT_VERSION is a non-empty stable string", () => {
  assert.equal(typeof PROMPT_VERSION, "string");
  assert.ok(PROMPT_VERSION.length > 0);
});

test("carries only allergen name, severity, and trace handling — never profile identity", () => {
  const prompt = buildUserPrompt({
    allergens: ALLERGENS,
    ingredientsText: "Water, sugar, whey powder.",
    deterministicHits: DETERMINISTIC_HITS,
  });

  assert.match(prompt, /Milk/);
  assert.match(prompt, /severity: severe/);
  assert.match(prompt, /traces must be treated as unsafe/);
  assert.match(prompt, /Peanut/);
  assert.match(prompt, /severity: moderate/);

  // Nothing about *who* the allergens belong to ever enters the prompt.
  assert.doesNotMatch(prompt, /profile/i);
  assert.doesNotMatch(prompt, /child/i);
  assert.doesNotMatch(prompt, /name:/i);
  assert.doesNotMatch(prompt, /age/i);
});

test("includes the verbatim ingredient text unmodified", () => {
  const text = "Water, SUGAR, whey powder (Milk), soy lecithin.";
  const prompt = buildUserPrompt({ allergens: ALLERGENS, ingredientsText: text, deterministicHits: [] });
  assert.ok(prompt.includes(text));
});

test("flags an allergen already confirmed by the keyword matcher", () => {
  const prompt = buildUserPrompt({
    allergens: ALLERGENS,
    ingredientsText: "Water, sugar, whey powder.",
    deterministicHits: DETERMINISTIC_HITS,
  });
  assert.match(prompt, /Milk \(severity: severe, traces must be treated as unsafe for this allergen\) \(already confirmed present by keyword match\)/);
  assert.doesNotMatch(prompt, /Peanut.*already confirmed present/);
});

test("system prompt tells the model it may only escalate, never clear a keyword match", () => {
  assert.match(SYSTEM_PROMPT, /never asked to clear or contradict a keyword match/i);
  assert.match(SYSTEM_PROMPT, /verbatim substring/i);
});
