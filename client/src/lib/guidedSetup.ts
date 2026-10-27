import type { AllergenChoice, AllergenInput, Severity } from "./api";
import { OTHER_ALLERGEN_KEY } from "./api";
import { spellingKey } from "./allergenChoiceCopy";

// The guided profile setup (routes/NewProfile.tsx, 2026-10-27, behind GUIDED_SETUP): one question
// at a time, answered by tapping. Plain functions over one answers object, under test. Nothing here
// saves: toCreateInput builds the same body the classic form sends to POST /profiles, and only the
// review step's Save calls it.

export type Who = "child" | "self" | "other";

/** A listed allergen's key ("tree-nut"), or "other:<name>" for one typed under "Something else". */
export type AllergenId = string;

export type GuidedAnswers = {
  who: Who | null;
  name: string;
  /** In the order chosen. Unticking removes an id here only, so ticking it again finds its answers. */
  picked: AllergenId[];
  /** The typed name of each "other:" id, as the parent typed it. */
  otherNames: Record<AllergenId, string>;
  /** No entry until the parent picks one: there is no default. Kept when an allergen is unticked. */
  severity: Record<AllergenId, Severity>;
  /** On unless the parent turns it off, the classic form's default. */
  mayContainUnsafe: Record<AllergenId, boolean>;
};

export function initialAnswers(): GuidedAnswers {
  return { who: null, name: "", picked: [], otherNames: {}, severity: {}, mayContainUnsafe: {} };
}

export type Position =
  | { step: "who" }
  | { step: "name" }
  | { step: "allergens" }
  | { step: "severity"; id: AllergenId }
  | { step: "mayContain" }
  | { step: "review" };

/** Every position, in order: one severity question per chosen allergen. */
export function positions(a: GuidedAnswers): Position[] {
  return [
    { step: "who" },
    { step: "name" },
    { step: "allergens" },
    ...a.picked.map((id): Position => ({ step: "severity", id })),
    { step: "mayContain" },
    { step: "review" },
  ];
}

function samePosition(x: Position, y: Position): boolean {
  return x.step === y.step && (x.step !== "severity" || (y.step === "severity" && x.id === y.id));
}

function indexOf(p: Position, a: GuidedAnswers): number {
  return positions(a).findIndex((q) => samePosition(p, q));
}

/** Whether this question is answered well enough to go on. Severity has no default. */
export function canContinue(p: Position, a: GuidedAnswers): boolean {
  switch (p.step) {
    case "who":
      return a.who !== null;
    case "name":
      return a.name.trim().length > 0;
    case "allergens":
      return a.picked.length > 0;
    case "severity":
      return a.severity[p.id] !== undefined;
    default:
      return true;
  }
}

export function next(p: Position, a: GuidedAnswers): Position {
  const all = positions(a);
  return all[Math.min(indexOf(p, a) + 1, all.length - 1)];
}

/** Back moves only; it never clears an answer. */
export function back(p: Position, a: GuidedAnswers): Position {
  return positions(a)[Math.max(indexOf(p, a) - 1, 0)];
}

/** The first question still unanswered, or the review when everything is. */
export function firstUnanswered(a: GuidedAnswers): Position {
  return positions(a).find((p) => !canContinue(p, a)) ?? { step: "review" };
}

/** How far along, 0–100, for the progress bar. No step numbers are shown. */
export function progress(p: Position, a: GuidedAnswers): number {
  const all = positions(a);
  return Math.round(((indexOf(p, a) + 1) / (all.length + 1)) * 100);
}

export function togglePick(a: GuidedAnswers, id: AllergenId): GuidedAnswers {
  return { ...a, picked: a.picked.includes(id) ? a.picked.filter((x) => x !== id) : [...a.picked, id] };
}

/** The "may contain" answer for an allergen: on unless turned off. */
export function mayContainUnsafe(a: GuidedAnswers, id: AllergenId): boolean {
  return a.mayContainUnsafe[id] ?? true;
}

export type OtherCheck =
  | { ok: true; id: AllergenId; name: string }
  | { ok: false; reason: "blank" }
  | { ok: false; reason: "listed"; choice: AllergenChoice };

/**
 * "Something else": a typed name, refused when the list already has it under any recognized spelling
 * ("treenuts", "Tree-Nuts", "peanuts") — the classic form's own check (spellingKey against each
 * choice's spellings), so the parent is offered the listed allergen instead. The server refuses it
 * again on save either way.
 */
export function checkOtherName(typed: string, choices: AllergenChoice[]): OtherCheck {
  const name = typed.trim();
  if (name === "") return { ok: false, reason: "blank" };
  const spelling = spellingKey(name);
  const choice = choices.find((c) => c.spellings.includes(spelling) || spellingKey(c.displayName) === spelling);
  if (choice) return { ok: false, reason: "listed", choice };
  return { ok: true, id: `other:${name.toLowerCase()}`, name };
}

export function addOther(a: GuidedAnswers, check: Extract<OtherCheck, { ok: true }>): GuidedAnswers {
  const withName = { ...a, otherNames: { ...a.otherNames, [check.id]: check.name } };
  return withName.picked.includes(check.id) ? withName : { ...withName, picked: [...withName.picked, check.id] };
}

export function isOther(id: AllergenId): boolean {
  return id.startsWith("other:");
}

/** The allergen's name as the questions say it: the list's name, or the typed one. */
export function allergenName(id: AllergenId, a: GuidedAnswers, choices: AllergenChoice[]): string {
  if (isOther(id)) return a.otherNames[id] ?? id.slice("other:".length);
  return choices.find((c) => c.key === id)?.displayName ?? id;
}

/**
 * The body for POST /profiles — exactly what the classic form sends: each allergen as its listed
 * key, or { key: "other", name } for one typed. Only when every chosen allergen has a severity.
 */
export function toCreateInput(a: GuidedAnswers): { label: string; isSelf: boolean; allergens: AllergenInput[] } | null {
  if (!a.who || a.name.trim() === "" || a.picked.length === 0) return null;
  if (a.picked.some((id) => a.severity[id] === undefined)) return null;
  return {
    label: a.name.trim(),
    isSelf: a.who === "self",
    allergens: a.picked.map((id) => ({
      ...(isOther(id) ? { key: OTHER_ALLERGEN_KEY, name: a.otherNames[id] } : { key: id }),
      severity: a.severity[id]!,
      treatTracesAsUnsafe: mayContainUnsafe(a, id),
    })),
  };
}
