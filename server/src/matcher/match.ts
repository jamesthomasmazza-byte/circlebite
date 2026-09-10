import { SYNONYM_CLUSTERS } from "./synonyms.js";

export type MatchSource = "tag" | "ingredients" | "trace";
export type Severity = "mild" | "moderate" | "severe";
export type Classification = "contains" | "caution" | "clear";

export type ProfileAllergen = { name: string; severity: Severity; treatTracesAsUnsafe: boolean };

export type ProductForMatching = {
  found: boolean;
  allergensTags: string[];
  tracesTags: string[];
  ingredientsText: string | null;
};

export type AllergenMatchResult = {
  allergenName: string;
  matched: boolean;
  source: MatchSource | null;
};

export type AllergenVerdictDetail = AllergenMatchResult & { classification: Classification };

export type Verdict = "safe" | "contains_allergen" | "may_contain_caution" | "unable_to_confirm";

function stripTrailingS(word: string): string {
  return word.length > 1 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** Unknown allergen name: literal match on the name itself, trailing "s" stripped first. */
function keywordsFor(allergenName: string): string[] {
  const normalized = allergenName.trim().toLowerCase();
  const cluster = SYNONYM_CLUSTERS.find((c) => c.aliases.includes(normalized));
  if (cluster) return cluster.keywords;
  const singular = stripTrailingS(normalized);
  return singular === normalized ? [normalized] : [normalized, singular];
}

function wordBoundaryMatch(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * Per allergen, first hit wins: structured tag, then ingredient text, then trace tag. Tags are
 * matched by exact equality (they're normalized, discrete values, not free text — see
 * openFoodFacts.ts); ingredient text is matched by word-boundary regex since it's prose.
 */
export function matchAllergen(allergenName: string, product: ProductForMatching): AllergenMatchResult {
  const keywords = keywordsFor(allergenName);

  for (const kw of keywords) {
    if (product.allergensTags.includes(kw)) return { allergenName, matched: true, source: "tag" };
  }
  if (product.ingredientsText) {
    for (const kw of keywords) {
      if (wordBoundaryMatch(product.ingredientsText, kw)) {
        return { allergenName, matched: true, source: "ingredients" };
      }
    }
  }
  for (const kw of keywords) {
    if (product.tracesTags.includes(kw)) return { allergenName, matched: true, source: "trace" };
  }

  return { allergenName, matched: false, source: null };
}

/**
 * Fail-closed shape from docs/legacy-spec.md §4: an empty product record produces
 * unable_to_confirm, never safe. The overall verdict is always computed against every allergen on
 * the profile — never filtered by who's asking — because filtering the safety check itself by a
 * follower's share_level could mean a real allergen gets missed entirely. See
 * server/src/routes/scans.ts for where that distinction is actually enforced.
 */
export function computeVerdict(
  allergens: ProfileAllergen[],
  product: ProductForMatching,
): { verdict: Verdict; matchedAllergens: AllergenVerdictDetail[] } {
  const hasUsableData =
    product.found &&
    (product.allergensTags.length > 0 || product.tracesTags.length > 0 || Boolean(product.ingredientsText));

  if (!hasUsableData) {
    return { verdict: "unable_to_confirm", matchedAllergens: [] };
  }

  const details: AllergenVerdictDetail[] = allergens.map((allergen) => {
    const result = matchAllergen(allergen.name, product);
    if (!result.matched) return { ...result, classification: "clear" };
    if (result.source === "trace" && !allergen.treatTracesAsUnsafe) {
      return { ...result, classification: "caution" };
    }
    return { ...result, classification: "contains" };
  });

  const verdict: Verdict = details.some((d) => d.classification === "contains")
    ? "contains_allergen"
    : details.some((d) => d.classification === "caution")
      ? "may_contain_caution"
      : "safe";

  return { verdict, matchedAllergens: details };
}
