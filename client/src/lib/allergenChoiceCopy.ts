import type { Allergen, AllergenChoice } from "./api";

// The words around picking a profile's allergens from the list (server matcher/allergenChoices.ts,
// 2026-10-23). Plain values, kept out of the components so they're under test.

export const GROUP_LABEL: Record<AllergenChoice["group"], string> = {
  common: "Most common",
  single_nut: "A single tree nut",
  other: "Others",
};

export const OTHER_OPTION_LABEL = "Not on the list — type it";

// What an allergen typed by hand is matched on (server match.ts): that word, and its singular, in
// the ingredients — no other names. Said where it's typed, so nobody assumes more.
export const OTHER_WARNING =
  "Scans will look for this exact word in the ingredients and nothing else. Check labels yourself for other names it goes by.";

/** The server refused a typed name because it's on the list (409 listed_allergen). */
export function listedAllergenMessage(typed: string | null, displayName: string): string {
  return typed
    ? `“${typed}” is on the list as ${displayName}. Choose ${displayName} from the list instead.`
    : `One of these is on the list as ${displayName}. Choose ${displayName} from the list instead.`;
}

export type ReviewNotice = { text: string; hint: string | null; keepLabel: string | null; chooseLabel: string };

/**
 * What a manager is told about an allergen from before the list that needs a look (migration 0046).
 * A recognized spelling already matches as its listed allergen (a key only adds matches), so the
 * notice says it does — "now" — and asks them to keep it or choose another. One the list doesn't
 * have is still matched as the word typed, and says only that.
 */
export function reviewNotice(allergen: Pick<Allergen, "name" | "allergen_key">, choice: AllergenChoice | undefined): ReviewNotice {
  if (choice) {
    return {
      text: `We matched “${allergen.name}” to ${choice.displayName}, and scans now check for it that way.`,
      hint: choice.hint,
      keepLabel: `Keep ${choice.displayName}`,
      chooseLabel: "Choose another",
    };
  }
  return {
    text: `“${allergen.name}” isn't on our list. Scans look for that exact word only.`,
    hint: null,
    keepLabel: "Keep it as typed",
    chooseLabel: "Choose from the list",
  };
}

/** The dashboard line for one managed profile with allergens needing a look. */
export function needsReviewLine(profilePossessiveName: string, count: number): string {
  return `${count === 1 ? "1 allergen" : `${count} allergens`} on ${profilePossessiveName} profile ${count === 1 ? "needs" : "need"} a look.`;
}

/**
 * The server's spellingKey (server/src/matcher/allergenChoices.ts), copied: case, spaces, hyphens and
 * a trailing "s" ignored. allergenChoiceCopy.test.ts runs it on the server test's own cases. Used only
 * to read the change history, and to refuse a typed name the list already has before the server
 * does (lib/guidedSetup.ts) — never to match a product or decide what's saved.
 */
export function spellingKey(name: string): string {
  const letters = name.toLowerCase().replace(/[^a-z]/g, "");
  return letters.length > 1 && letters.endsWith("s") ? letters.slice(0, -1) : letters;
}

/** The listed allergen a rename confirmed — the new name is its own, and the old name is one of its
 *  spellings — or undefined for any other rename, which keeps the history's warning. */
export function confirmedListedAllergen(
  before: string,
  after: string,
  choices: readonly AllergenChoice[],
): AllergenChoice | undefined {
  const choice = choices.find((c) => c.displayName === after);
  return choice && choice.spellings.includes(spellingKey(before)) ? choice : undefined;
}
