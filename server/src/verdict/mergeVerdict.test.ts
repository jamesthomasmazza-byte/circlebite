import assert from "node:assert/strict";
import { test } from "node:test";

import type { AllergenVerdictDetail } from "../matcher/match.js";
import { mergeVerdict } from "./mergeVerdict.js";
import type { AiFinding, ProfileAllergen, ReasonVerdictResult } from "./types.js";

const ALLERGENS: ProfileAllergen[] = [
  { name: "Milk", severity: "severe", treatTracesAsUnsafe: true },
  { name: "Soy", severity: "mild", treatTracesAsUnsafe: false },
];

function det(overrides: Partial<AllergenVerdictDetail>): AllergenVerdictDetail {
  return { allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear", ...overrides };
}

function ok(findings: AiFinding[], unresolvedTerms: string[] = []): ReasonVerdictResult {
  return {
    findings,
    unresolvedTerms,
    failed: false,
    model: "claude-haiku-4-5-20251001",
    promptVersion: "path-b-v1",
    latencyMs: 10,
    tokensIn: 100,
    tokensOut: 20,
    costCents: 0.02,
  };
}

function failed(): ReasonVerdictResult {
  return {
    findings: [],
    unresolvedTerms: [],
    failed: true,
    model: "claude-haiku-4-5-20251001",
    promptVersion: "path-b-v1",
    latencyMs: 0,
    tokensIn: null,
    tokensOut: null,
    costCents: null,
  };
}

test("a deterministic 'contains' is never touched by the AI, even if the AI reports 'no'", () => {
  const { verdict, matchedAllergens } = mergeVerdict(
    [det({ classification: "contains", matched: true, source: "ingredients" })],
    ok([{ allergen: "Milk", present: "no", citedSpan: "", reason: "not found", confidence: "high" }]),
    ALLERGENS,
  );
  assert.equal(verdict, "contains_allergen");
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].source, "deterministic");
});

test("a deterministic 'caution' (trace tag) escalates to 'contains' only on an AI present:'yes'", () => {
  const { matchedAllergens } = mergeVerdict(
    [det({ classification: "caution", matched: true, source: "trace" })],
    ok([{ allergen: "Milk", present: "yes", citedSpan: "milk", reason: "direct ingredient", confidence: "medium" }]),
    ALLERGENS,
  );
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].source, "ai");
});

test("a deterministic 'caution' is not disturbed by an AI finding that isn't 'yes'", () => {
  const { matchedAllergens } = mergeVerdict(
    [det({ classification: "caution", matched: true, source: "trace" })],
    ok([{ allergen: "Milk", present: "trace", citedSpan: "milk", reason: "may contain", confidence: "medium" }]),
    ALLERGENS,
  );
  assert.equal(matchedAllergens[0].classification, "caution");
  assert.equal(matchedAllergens[0].source, "deterministic");
});

test("a 'clear' allergen escalates to 'contains' on present:'yes' with a valid span", () => {
  const { verdict, matchedAllergens } = mergeVerdict(
    [det({ classification: "clear" })],
    ok([{ allergen: "Milk", present: "yes", citedSpan: "whey powder", reason: "milk derivative", confidence: "medium" }]),
    ALLERGENS,
  );
  assert.equal(verdict, "contains_allergen");
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].citedSpan, "whey powder");
});

test("a 'clear' allergen with treatTracesAsUnsafe escalates a 'trace' finding straight to 'contains'", () => {
  const { verdict, matchedAllergens } = mergeVerdict(
    [det({ classification: "clear" })], // Milk, treatTracesAsUnsafe: true
    ok([{ allergen: "Milk", present: "trace", citedSpan: "may contain milk", reason: "traces warning", confidence: "medium" }]),
    ALLERGENS,
  );
  assert.equal(verdict, "contains_allergen");
  assert.equal(matchedAllergens[0].classification, "contains");
});

test("a 'clear' allergen without treatTracesAsUnsafe escalates a 'trace' finding to 'caution', not 'contains'", () => {
  const { verdict, matchedAllergens } = mergeVerdict(
    [det({ allergenName: "Soy", severity: "mild", classification: "clear" })],
    ok([{ allergen: "Soy", present: "trace", citedSpan: "may contain soy", reason: "traces warning", confidence: "medium" }]),
    ALLERGENS,
  );
  assert.equal(verdict, "may_contain_caution");
  assert.equal(matchedAllergens[0].classification, "caution");
});

test("present:'unknown' moves a 'clear' allergen to 'unresolved', which forces unable_to_confirm — never silently 'clear'", () => {
  const { verdict, matchedAllergens } = mergeVerdict(
    [det({ classification: "clear" })],
    ok([{ allergen: "Milk", present: "unknown", citedSpan: "", reason: "ambiguous additive code", confidence: "low" }]),
    ALLERGENS,
  );
  assert.equal(verdict, "unable_to_confirm");
  assert.equal(matchedAllergens[0].classification, "unresolved");
});

test("present:'no' or no finding at all leaves a 'clear' allergen 'clear'", () => {
  const noFinding = mergeVerdict([det({ classification: "clear" })], ok([]), ALLERGENS);
  assert.equal(noFinding.verdict, "safe");
  assert.equal(noFinding.matchedAllergens[0].classification, "clear");

  const explicitNo = mergeVerdict(
    [det({ classification: "clear" })],
    ok([{ allergen: "Milk", present: "no", citedSpan: "", reason: "not mentioned", confidence: "high" }]),
    ALLERGENS,
  );
  assert.equal(explicitNo.verdict, "safe");
  assert.equal(explicitNo.matchedAllergens[0].classification, "clear");
});

test("an AI failure downgrades an otherwise-safe verdict to unable_to_confirm", () => {
  const { verdict, confidence } = mergeVerdict([det({ classification: "clear" })], failed(), ALLERGENS);
  assert.equal(verdict, "unable_to_confirm");
  assert.equal(confidence, "low");
});

test("an AI failure changes nothing when the deterministic pass already found the allergen", () => {
  const { verdict } = mergeVerdict(
    [det({ classification: "contains", matched: true, source: "ingredients" })],
    failed(),
    ALLERGENS,
  );
  assert.equal(verdict, "contains_allergen");
});

test("an AI failure changes nothing when the deterministic pass already flagged a caution", () => {
  const { verdict } = mergeVerdict([det({ classification: "caution", matched: true, source: "trace" })], failed(), ALLERGENS);
  assert.equal(verdict, "may_contain_caution");
});

test("multi-allergen rollup: any contains beats any caution or unresolved", () => {
  const { verdict } = mergeVerdict(
    [
      det({ allergenName: "Milk", classification: "clear" }),
      det({ allergenName: "Soy", severity: "mild", classification: "clear" }),
    ],
    ok([
      { allergen: "Milk", present: "unknown", citedSpan: "", reason: "ambiguous", confidence: "low" },
      { allergen: "Soy", present: "yes", citedSpan: "soy lecithin", reason: "direct ingredient", confidence: "medium" },
    ]),
    ALLERGENS,
  );
  assert.equal(verdict, "contains_allergen");
});

test("confidence is medium for every non-unable_to_confirm verdict in this Path B slice", () => {
  const safe = mergeVerdict([det({ classification: "clear" })], ok([]), ALLERGENS);
  assert.equal(safe.confidence, "medium");

  const contains = mergeVerdict([det({ classification: "contains", matched: true, source: "ingredients" })], ok([]), ALLERGENS);
  assert.equal(contains.confidence, "medium");
});
