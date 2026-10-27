import assert from "node:assert/strict";
import { test } from "node:test";

import type { AllergenChoice } from "./api";
import {
  addOther,
  back,
  canContinue,
  checkOtherName,
  firstUnanswered,
  initialAnswers,
  mayContainUnsafe,
  next,
  positions,
  toCreateInput,
  togglePick,
  type GuidedAnswers,
  type Position,
} from "./guidedSetup";
import {
  allergensQuestion,
  chipReply,
  mayContainQuestion,
  nameQuestion,
  reviewQuestion,
  severityQuestion,
} from "./guidedSetupCopy";
import { SEVERITY_CHOICES } from "./severityCopy";

// The guided profile setup (2026-10-27): its answers and steps, pure.

const CHOICES: AllergenChoice[] = [
  { key: "dairy", displayName: "Milk", group: "common", hint: "Also matches lactose, whey and casein.", spellings: ["milk", "dairy"] },
  { key: "peanut", displayName: "Peanut", group: "common", hint: null, spellings: ["peanut", "groundnut"] },
  { key: "tree-nut", displayName: "Tree nuts", group: "common", hint: "Matches any tree nut: almond, cashew, walnut and more.", spellings: ["treenut"] },
];

function answered(): GuidedAnswers {
  let a: GuidedAnswers = { ...initialAnswers(), who: "child", name: "Maya" };
  a = togglePick(togglePick(a, "peanut"), "tree-nut");
  return a;
}

test("no severity default: every chosen allergen starts unanswered, and its question won't continue", () => {
  const a = answered();
  assert.deepEqual(a.severity, {});
  for (const id of a.picked) assert.equal(canContinue({ step: "severity", id }, a), false);
  assert.equal(toCreateInput(a), null, "nothing to save without severities");
  const one = { ...a, severity: { peanut: "severe" as const } };
  assert.equal(canContinue({ step: "severity", id: "peanut" }, one), true);
  assert.equal(toCreateInput(one), null, "still one unanswered");
});

test("answers map to the exact keys, the classic form's body", () => {
  let a = answered();
  a = addOther(a, checkOtherName("kiwi", CHOICES) as Extract<ReturnType<typeof checkOtherName>, { ok: true }>);
  a = { ...a, severity: { peanut: "severe", "tree-nut": "moderate", "other:kiwi": "mild" }, mayContainUnsafe: { "tree-nut": false } };
  assert.deepEqual(toCreateInput(a), {
    label: "Maya",
    isSelf: false,
    allergens: [
      { key: "peanut", severity: "severe", treatTracesAsUnsafe: true },
      { key: "tree-nut", severity: "moderate", treatTracesAsUnsafe: false },
      { key: "other", name: "kiwi", severity: "mild", treatTracesAsUnsafe: true },
    ],
  });
});

test("'Myself' is is_self; the other two aren't", () => {
  const done = (who: GuidedAnswers["who"]) => ({ ...answered(), who, severity: { peanut: "mild" as const, "tree-nut": "mild" as const } });
  assert.equal(toCreateInput(done("self"))?.isSelf, true);
  assert.equal(toCreateInput(done("child"))?.isSelf, false);
  assert.equal(toCreateInput(done("other"))?.isSelf, false);
});

test("'may contain' is on by default, as on the classic form", () => {
  const a = answered();
  for (const id of a.picked) assert.equal(mayContainUnsafe(a, id), true);
});

test("'Something else' refuses a listed allergen under any recognized spelling, and offers it", () => {
  for (const typed of ["treenuts", "Tree-Nuts", "tree nut", "peanuts", " Peanut "]) {
    const check = checkOtherName(typed, CHOICES);
    assert.equal(check.ok, false, typed);
    assert.equal(!check.ok && check.reason, "listed", typed);
  }
  const tree = checkOtherName("treenuts", CHOICES);
  assert.equal(!tree.ok && tree.reason === "listed" && tree.choice.key, "tree-nut");
  assert.deepEqual(checkOtherName("kiwi", CHOICES), { ok: true, id: "other:kiwi", name: "kiwi" });
  assert.deepEqual(checkOtherName("   ", CHOICES), { ok: false, reason: "blank" });
});

test("Back never loses an answer, from any step", () => {
  const a = { ...answered(), severity: { peanut: "severe" as const, "tree-nut": "mild" as const }, mayContainUnsafe: { peanut: false } };
  const all = positions(a);
  let p: Position = { step: "review" };
  for (let i = all.length - 1; i > 0; i--) p = back(p, a);
  assert.deepEqual(p, { step: "who" });
  assert.deepEqual(toCreateInput(a)?.allergens.map((x) => x.severity), ["severe", "mild"], "every answer still there");
});

test("unticking and re-ticking an allergen keeps its severity and 'may contain' answer", () => {
  let a: GuidedAnswers = { ...answered(), severity: { peanut: "severe" }, mayContainUnsafe: { peanut: false } };
  a = togglePick(a, "peanut");
  assert.equal(a.picked.includes("peanut"), false);
  a = togglePick(a, "peanut");
  assert.equal(a.severity.peanut, "severe");
  assert.equal(mayContainUnsafe(a, "peanut"), false);
});

test("one severity question per allergen, in order, then 'may contain', then the review", () => {
  const a = answered();
  assert.deepEqual(positions(a).map((p) => (p.step === "severity" ? `severity:${p.id}` : p.step)), [
    "who", "name", "allergens", "severity:peanut", "severity:tree-nut", "mayContain", "review",
  ]);
  assert.deepEqual(next({ step: "allergens" }, a), { step: "severity", id: "peanut" });
});

test("a change from the review goes back to it once everything's answered, or to what isn't", () => {
  const done = { ...answered(), severity: { peanut: "severe" as const, "tree-nut": "mild" as const } };
  assert.deepEqual(firstUnanswered(done), { step: "review" });
  const added = togglePick(done, "dairy");
  assert.deepEqual(firstUnanswered(added), { step: "severity", id: "dairy" }, "a new allergen needs its severity");
});

test("every question after the name uses it, or 'you' for Myself", () => {
  const maya = { who: "child" as const, name: "Maya" };
  for (const q of [allergensQuestion(maya), severityQuestion(maya, "Peanut"), mayContainQuestion(maya), reviewQuestion(maya)]) {
    assert.match(q, /Maya/);
    assert.doesNotMatch(q, /your child/);
  }
  assert.equal(allergensQuestion(maya), "Which of these is Maya allergic to?");
  assert.equal(severityQuestion(maya, "Peanut"), "How severe is Maya's peanut allergy?");
  const me = { who: "self" as const, name: "Pat" };
  assert.equal(allergensQuestion(me), "Which of these are you allergic to?");
  assert.equal(severityQuestion(me, "Peanut"), "How severe is your peanut allergy?");
  assert.equal(nameQuestion("child"), "What's your child's first name?");
});

test("a chip's quiet reply is the list's own hint; severity lines are severityCopy's own", () => {
  assert.equal(chipReply(CHOICES[2]), "Tree nuts — matches any tree nut: almond, cashew, walnut and more.");
  assert.equal(chipReply(CHOICES[1]), "Peanut");
  assert.equal(SEVERITY_CHOICES.length, 3);
});
