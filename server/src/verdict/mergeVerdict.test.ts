import assert from "node:assert/strict";
import { test } from "node:test";

import type { AllergenVerdictDetail } from "../matcher/match.js";
import { isTraceEscalatedToContains, mergeVerdict } from "./mergeVerdict.js";
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
    failureReason: null,
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
    failureReason: "request_failed",
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
  assert.equal(matchedAllergens[0].aiEscalated, false);
});

test("a deterministic 'caution' (trace tag) escalates to 'contains' only on an AI present:'yes'", () => {
  const { matchedAllergens } = mergeVerdict(
    [det({ classification: "caution", matched: true, source: "trace" })],
    ok([{ allergen: "Milk", present: "yes", citedSpan: "milk", reason: "direct ingredient", confidence: "medium" }]),
    ALLERGENS,
  );
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].aiEscalated, true);
  // The deterministic trace-tag source is preserved even though the AI escalated the outcome —
  // the client still has the original evidence available, not just the final verdict.
  assert.equal(matchedAllergens[0].source, "trace");
  // Not a trace-escalation, even though `source` reads "trace": the AI found direct evidence
  // ("yes", not "trace") independent of the existing trace tag — a genuine "contains" claim, not a
  // "may contain" one dressed up. isTraceEscalatedToContains has to tell these apart correctly, or
  // the card would wrongly soften a real direct finding into "treat as containing".
  assert.equal(isTraceEscalatedToContains(matchedAllergens[0]), false);
});

test("a deterministic 'caution' is not disturbed by an AI finding that isn't 'yes'", () => {
  const { matchedAllergens } = mergeVerdict(
    [det({ classification: "caution", matched: true, source: "trace" })],
    ok([{ allergen: "Milk", present: "trace", citedSpan: "milk", reason: "may contain", confidence: "medium" }]),
    ALLERGENS,
  );
  assert.equal(matchedAllergens[0].classification, "caution");
  assert.equal(matchedAllergens[0].aiEscalated, false);
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
  // The label said "may contain," not "contains" — the card must be able to tell these apart even
  // though the classification value is the same "contains" as a genuine direct finding.
  assert.equal(matchedAllergens[0].escalatedFromTrace, true);
  assert.equal(isTraceEscalatedToContains(matchedAllergens[0]), true);
});

test("a deterministic trace-tag match escalated to 'contains' by treatTracesAsUnsafe (match.ts's own doing, no AI involved) is still detected as trace-escalated via source alone", () => {
  const { matchedAllergens } = mergeVerdict(
    [det({ classification: "contains", matched: true, source: "trace" })], // match.ts already resolved treatTracesAsUnsafe
    ok([]),
    ALLERGENS,
  );
  assert.equal(matchedAllergens[0].classification, "contains");
  assert.equal(matchedAllergens[0].aiEscalated, false);
  assert.equal(isTraceEscalatedToContains(matchedAllergens[0]), true);
});

test("a genuine deterministic 'contains' from a direct match (not a trace) is never flagged as trace-escalated", () => {
  const { matchedAllergens } = mergeVerdict(
    [det({ classification: "contains", matched: true, source: "ingredients" })],
    ok([]),
    ALLERGENS,
  );
  assert.equal(isTraceEscalatedToContains(matchedAllergens[0]), false);
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

// Path C — docs/verdict-engine.md: a photo-sourced read must never claim "safe" the way a
// barcode-backed one does. This is the safety property the whole Path C design rests on, so it's
// asserted directly across every classification x finding combination the fixtures above already
// build, not implied by a couple of spot-check examples.
test("invariant: photoSourced:true never returns verdict 'safe', and never classifies an allergen 'clear', for any deterministic/AI combination", () => {
  const detOptions: AllergenVerdictDetail[] = [
    det({ classification: "clear" }),
    det({ classification: "caution", matched: true, source: "trace" }),
    det({ classification: "contains", matched: true, source: "ingredients" }),
  ];
  const findingOptions: (AiFinding | undefined)[] = [
    undefined,
    { allergen: "Milk", present: "no", citedSpan: "", reason: "not mentioned", confidence: "high" },
    { allergen: "Milk", present: "unknown", citedSpan: "", reason: "ambiguous", confidence: "low" },
    { allergen: "Milk", present: "trace", citedSpan: "milk", reason: "may contain", confidence: "medium" },
    { allergen: "Milk", present: "yes", citedSpan: "milk", reason: "direct ingredient", confidence: "medium" },
  ];
  const aiOutcomes: ReasonVerdictResult[] = [failed(), ...findingOptions.map((f) => ok(f ? [f] : []))];

  for (const d of detOptions) {
    for (const ai of aiOutcomes) {
      const { verdict, matchedAllergens } = mergeVerdict([d], ai, ALLERGENS, { photoSourced: true });
      assert.notEqual(
        verdict,
        "safe",
        `det=${d.classification} ai=${JSON.stringify(ai.findings)} failed=${ai.failed} produced "safe"`,
      );
      // The rollup-level check above isn't the whole safety property — a real per-allergen "clear"
      // is exactly what disappears from the card (docs/principles.md's Sept 26, 2026 precedent: the
      // override has to apply everywhere the "can't see everything" claim is made, not just at the
      // top).
      assert.ok(
        matchedAllergens.every((a) => a.classification !== "clear"),
        `det=${d.classification} ai=${JSON.stringify(ai.findings)} failed=${ai.failed} produced a 'clear' allergen on a photoSourced merge`,
      );
    }
  }
});

test("photoSourced:true with nothing found becomes 'unchecked', not 'clear' — rollup downgrades to 'unable_to_confirm', confidence low", () => {
  const { verdict, confidence, matchedAllergens } = mergeVerdict([det({ classification: "clear" })], ok([]), ALLERGENS, {
    photoSourced: true,
  });
  assert.equal(verdict, "unable_to_confirm");
  assert.equal(confidence, "low");
  assert.equal(matchedAllergens[0].classification, "unchecked");
});

test("photoSourced:true treats an explicit AI 'no' over ingredients_text the same as no finding at all — still 'unchecked', not 'clear'", () => {
  // The AI's "no" is scoped to ingredients_text alone; it was never shown the label's separate
  // contains/may-contain statement, so it carries no more trust than silence would.
  const { matchedAllergens } = mergeVerdict(
    [det({ classification: "clear" })],
    ok([{ allergen: "Milk", present: "no", citedSpan: "", reason: "not mentioned in the ingredient list", confidence: "high" }]),
    ALLERGENS,
    { photoSourced: true },
  );
  assert.equal(matchedAllergens[0].classification, "unchecked");
});

test("photoSourced:true with six allergens, all unchecked: rollup is unable_to_confirm, not safe", () => {
  const sixAllergens: ProfileAllergen[] = [
    { name: "Milk", severity: "severe", treatTracesAsUnsafe: true },
    { name: "Soy", severity: "mild", treatTracesAsUnsafe: false },
    { name: "Egg", severity: "moderate", treatTracesAsUnsafe: false },
    { name: "Peanut", severity: "severe", treatTracesAsUnsafe: true },
    { name: "Wheat", severity: "mild", treatTracesAsUnsafe: false },
    { name: "Sesame", severity: "moderate", treatTracesAsUnsafe: false },
  ];
  const sixDet = sixAllergens.map((a) => det({ allergenName: a.name, severity: a.severity, classification: "clear" }));
  const { verdict, matchedAllergens } = mergeVerdict(sixDet, ok([]), sixAllergens, { photoSourced: true });
  assert.equal(verdict, "unable_to_confirm");
  assert.equal(matchedAllergens.length, 6);
  assert.ok(matchedAllergens.every((a) => a.classification === "unchecked"));
});

test("photoSourced:true, mixed profile: a real 'contains' rolls up the verdict, but the other allergen stays 'unchecked' — never silently 'clear'", () => {
  // The exact silent-miss this classification exists to close: before it existed, Peanut's real
  // "contains" made the overall card correctly unsafe, but Almond — genuinely unchecked — rendered
  // as plain "clear" and disappeared from the list, indistinguishable from "the label said nothing
  // about it."
  const { verdict, matchedAllergens } = mergeVerdict(
    [
      det({ allergenName: "Peanut", severity: "severe", classification: "contains", matched: true, source: "tag" }),
      det({ allergenName: "Almond", severity: "severe", classification: "clear" }),
    ],
    ok([]),
    [
      { name: "Peanut", severity: "severe", treatTracesAsUnsafe: true },
      { name: "Almond", severity: "severe", treatTracesAsUnsafe: true },
    ],
    { photoSourced: true },
  );
  assert.equal(verdict, "contains_allergen");
  const almond = matchedAllergens.find((a) => a.allergenName === "Almond");
  assert.equal(almond?.classification, "unchecked");
});

test("photoSourced:false (the default) — 'clear' stays 'clear', 'unchecked' never appears", () => {
  const { verdict, matchedAllergens } = mergeVerdict([det({ classification: "clear" })], ok([]), ALLERGENS);
  assert.equal(verdict, "safe");
  assert.equal(matchedAllergens[0].classification, "clear");
});

test("photoSourced:true never suppresses a real finding — contains/caution still escalate normally", () => {
  const contains = mergeVerdict(
    [det({ classification: "clear" })],
    ok([{ allergen: "Milk", present: "yes", citedSpan: "whey powder", reason: "milk derivative", confidence: "medium" }]),
    ALLERGENS,
    { photoSourced: true },
  );
  assert.equal(contains.verdict, "contains_allergen");

  const caution = mergeVerdict(
    [det({ allergenName: "Soy", severity: "mild", classification: "clear" })],
    ok([{ allergen: "Soy", present: "trace", citedSpan: "may contain soy", reason: "traces warning", confidence: "medium" }]),
    ALLERGENS,
    { photoSourced: true },
  );
  assert.equal(caution.verdict, "may_contain_caution");

  const deterministicContains = mergeVerdict(
    [det({ classification: "contains", matched: true, source: "ingredients" })],
    ok([]),
    ALLERGENS,
    { photoSourced: true },
  );
  assert.equal(deterministicContains.verdict, "contains_allergen");
});

test("photoSourced defaults to false — Path B's existing call sites are unaffected", () => {
  const { verdict } = mergeVerdict([det({ classification: "clear" })], ok([]), ALLERGENS);
  assert.equal(verdict, "safe");
});

test("confidence is medium for every non-unable_to_confirm verdict in this Path B slice", () => {
  const safe = mergeVerdict([det({ classification: "clear" })], ok([]), ALLERGENS);
  assert.equal(safe.confidence, "medium");

  const contains = mergeVerdict([det({ classification: "contains", matched: true, source: "ingredients" })], ok([]), ALLERGENS);
  assert.equal(contains.confidence, "medium");
});
