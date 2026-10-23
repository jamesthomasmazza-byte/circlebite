import { SYNONYM_CLUSTERS } from "./synonyms.js";

/**
 * The allergens a profile can pick from (2026-10-23). Free text let "treenuts" onto a profile, the
 * matcher's aliases are "tree nut"/"tree nuts", and the Oct 16 card missed the almonds in a chewy bar
 * (barcode 096619160761) — the same class as the Peanut/peanut bug. A pick stores the cluster's id as
 * `allergens.allergen_key` (migration 0046) and `displayName` as the name.
 *
 * Every displayName is one of its cluster's own aliases (allergenChoices.test.ts), so even code that
 * matches on the name alone — corroboration keys, allergensOverlap, the AI prompt — reads it right.
 * Every cluster in synonyms.ts is offered. `hint` says what the pick matches beyond its own name, and
 * names only words in that cluster's keywords — true by construction, never a claim of our own.
 */
export type AllergenChoiceGroup = "common" | "single_nut" | "other";

export type AllergenChoice = {
  key: string;
  displayName: string;
  group: AllergenChoiceGroup;
  hint: string | null;
};

// Not "only": a single nut also matches unnamed "nuts", which could be it (synonyms.ts).
const NUT_HINT = (nut: string) => `Matches ${nut}, and unnamed “nuts”. Choose Tree nuts for every nut.`;

export const ALLERGEN_CHOICES: AllergenChoice[] = [
  // The US top nine, in the order a parent is most likely to look for them.
  { key: "dairy", displayName: "Milk", group: "common", hint: "Also matches lactose, whey and casein." },
  { key: "egg", displayName: "Egg", group: "common", hint: null },
  { key: "peanut", displayName: "Peanut", group: "common", hint: null },
  { key: "tree-nut", displayName: "Tree nuts", group: "common", hint: "Matches any tree nut: almond, cashew, walnut and more." },
  { key: "gluten", displayName: "Wheat", group: "common", hint: "Also matches barley and rye." },
  { key: "soy", displayName: "Soy", group: "common", hint: null },
  { key: "sesame", displayName: "Sesame", group: "common", hint: null },
  { key: "fish", displayName: "Fish", group: "common", hint: null },
  { key: "crustacean", displayName: "Shellfish", group: "common", hint: "Crab, shrimp, lobster. For clams or oysters, choose Molluscs." },
  { key: "almond", displayName: "Almond", group: "single_nut", hint: NUT_HINT("almond") },
  { key: "brazil-nut", displayName: "Brazil nut", group: "single_nut", hint: NUT_HINT("Brazil nut") },
  { key: "cashew", displayName: "Cashew", group: "single_nut", hint: NUT_HINT("cashew") },
  { key: "hazelnut", displayName: "Hazelnut", group: "single_nut", hint: NUT_HINT("hazelnut") },
  { key: "macadamia", displayName: "Macadamia", group: "single_nut", hint: NUT_HINT("macadamia") },
  { key: "pecan", displayName: "Pecan", group: "single_nut", hint: NUT_HINT("pecan") },
  { key: "pistachio", displayName: "Pistachio", group: "single_nut", hint: NUT_HINT("pistachio") },
  { key: "walnut", displayName: "Walnut", group: "single_nut", hint: NUT_HINT("walnut") },
  { key: "mollusc", displayName: "Molluscs", group: "other", hint: null },
  { key: "celery", displayName: "Celery", group: "other", hint: null },
  { key: "lupin", displayName: "Lupin", group: "other", hint: null },
  { key: "sulphite", displayName: "Sulphites", group: "other", hint: null },
];

/** An allergen typed in by hand: matched on that word alone (match.ts), never a cluster. */
export const OTHER_KEY = "other";

export function choiceForKey(key: string): AllergenChoice | undefined {
  return ALLERGEN_CHOICES.find((c) => c.key === key);
}

/**
 * A spelling with case, spaces, hyphens and a trailing "s" ignored — "treenuts", "Tree-Nuts" and
 * "tree nut" are one. Used only to RECOGNIZE a typed name as a listed allergen, never to match a
 * product: migration 0046 holds a frozen SQL copy of it (allergenChoices.test.ts checks they agree).
 */
export function spellingKey(name: string): string {
  const letters = name.toLowerCase().replace(/[^a-z]/g, "");
  return letters.length > 1 && letters.endsWith("s") ? letters.slice(0, -1) : letters;
}

/**
 * Which listed allergen a typed name is, if any — `exact` when it's one of the cluster's aliases as
 * written (case and surrounding space aside), which the matcher already handled, and false when only
 * the spelling check found it ("treenuts"), which the matcher missed.
 */
export function recognizeAllergenName(name: string): { key: string; exact: boolean } | null {
  const normalized = name.trim().toLowerCase();
  const spelling = spellingKey(name);
  for (const cluster of SYNONYM_CLUSTERS) {
    if (cluster.aliases.includes(normalized)) return { key: cluster.id, exact: true };
  }
  for (const cluster of SYNONYM_CLUSTERS) {
    if (cluster.aliases.some((alias) => spellingKey(alias) === spelling)) return { key: cluster.id, exact: false };
  }
  return null;
}

/**
 * The list as the client gets it: each choice with the spellings recognized as it (spellingKey of
 * every alias), so the change history can tell a rename that confirms a match ("treenuts" → Tree
 * nuts — the match only widened) from one that swaps the allergen (Peanut → Walnut — warnings stop).
 */
export function choicesForClient(): (AllergenChoice & { spellings: string[] })[] {
  return ALLERGEN_CHOICES.map((choice) => {
    const cluster = SYNONYM_CLUSTERS.find((c) => c.id === choice.key)!;
    return { ...choice, spellings: [...new Set(cluster.aliases.map(spellingKey))] };
  });
}
