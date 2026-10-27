import type { AllergenChoice } from "./api";
import type { GuidedAnswers, Who } from "./guidedSetup";

// The guided profile setup's words (routes/NewProfile.tsx, 2026-10-27). Plain values, under test.
// Original wording; the severity lines and allergen hints are the app's own (severityCopy.ts,
// server matcher/allergenChoices.ts), reused as they are.

export const WHO_CHOICES: { value: Who; label: string; line: string }[] = [
  { value: "child", label: "My child", line: "A son, daughter or another child you look after" },
  { value: "self", label: "Myself", line: "Your own allergies" },
  { value: "other", label: "Someone else I care for", line: "An adult or child in your care" },
];

export const WHO_QUESTION = "Who is this profile for?";
export const WHO_SUB = "You can add more profiles later.";

export function nameQuestion(who: Who | null): string {
  if (who === "self") return "What should we call you?";
  if (who === "child") return "What's your child's first name?";
  return "What's their first name?";
}
export const NAME_SUB = "A nickname is fine.";
export const NAME_LABEL = "First name";

type Named = Pick<GuidedAnswers, "who" | "name">;
const self = (a: Named) => a.who === "self";

/** "Maya's" or "your", once there's a name: every question from here on uses it. */
export function whose(a: Named): string {
  return self(a) ? "your" : `${a.name.trim()}'s`;
}

export function allergensQuestion(a: Named): string {
  return self(a) ? "Which of these are you allergic to?" : `Which of these is ${a.name.trim()} allergic to?`;
}
export const ALLERGENS_SUB = "Choose all that apply.";
export const SHOW_MORE = "Show more";
export const SOMETHING_ELSE = "Something else";
export const OTHER_LABEL = "Allergen name";
export const ADD_OTHER = "Add";

export function severityQuestion(a: Named, allergen: string): string {
  return `How severe is ${whose(a)} ${allergen.toLowerCase()} allergy?`;
}

export function mayContainQuestion(a: Named): string {
  return self(a) ? "Should “may contain” warnings count as unsafe for you?" : `Should “may contain” warnings count as unsafe for ${a.name.trim()}?`;
}
export const MAY_CONTAIN_SUB = "On for each allergen unless you turn it off.";
/** The classic form's own checkbox wording. */
export const MAY_CONTAIN_LABEL = 'Treat "may contain traces" as unsafe';

export function reviewQuestion(a: Named): string {
  return self(a) ? "Check your profile" : `Check ${whose(a)} profile`;
}
export const REVIEW_SUB = "Tap anything to change it. Nothing is saved until you save.";
export const SAVE = "Save profile";
export const BACK_TO_REVIEW = "Back to review";
export const CONTINUE = "Continue";
export const BACK = "Back";
export const CHANGE = "Change";
export const CLASSIC_LINK = "Use the classic form";

export function mayContainSummary(on: boolean): string {
  return on ? "“may contain” counts as unsafe" : "“may contain” doesn't count as unsafe";
}

export function savedLine(a: Named): string {
  return self(a) ? "Your profile is saved." : `${whose(a)} profile is saved.`;
}
export function finishQuestion(a: Named): string {
  return self(a) ? "Here's what every scan for you checks" : `Here's what every scan for ${a.name.trim()} checks`;
}
export const SAMPLE_BUTTON = "Try a sample scan";
export const SAMPLE_LINE = "A real check of a made-up product, so you can see what a result looks like.";
export const GO_TO_SCAN = "Go to Scan";

/** The quiet reply after a chip is chosen: its name and the list's own hint, if it has one. */
export function chipReply(choice: Pick<AllergenChoice, "displayName" | "hint">): string {
  if (!choice.hint) return choice.displayName;
  return `${choice.displayName} — ${choice.hint.charAt(0).toLowerCase()}${choice.hint.slice(1)}`;
}

/** The short label each answer goes under in the one-line transcript above a question. */
export const ASKED_LABEL = { who: "Who it's for", name: "First name", allergens: "Allergens", severity: "Severity", mayContain: "May contain" } as const;
