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
  /** Ingredient-text matches only: the exact characters matched, sliced from ingredientsText
   *  itself (never the keyword, never reconstructed), so the card can quote what to look for on the
   *  package. Absent for tag and trace matches, which have no source text to quote. */
  matchedText?: string;
};

// Carries severity through into the stored snapshot, not just matched/source/classification —
// needed so a severe_only follower's scan *history* view (server/src/routes/scans.ts) can filter
// to severe allergens without a join back to the live allergens table, whose severities could
// have changed since the scan was actually performed.
export type AllergenVerdictDetail = AllergenMatchResult & { severity: Severity; classification: Classification };

export type Verdict = "safe" | "contains_allergen" | "may_contain_caution" | "unable_to_confirm";

function stripTrailingS(word: string): string {
  return word.length > 1 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function normalizeAllergenName(allergenName: string): string {
  return allergenName.trim().toLowerCase();
}

function clusterFor(normalized: string) {
  return SYNONYM_CLUSTERS.find((c) => c.aliases.includes(normalized));
}

/** Unknown allergen name: literal match on the name itself, trailing "s" stripped first. */
function keywordsFor(allergenName: string): string[] {
  const normalized = normalizeAllergenName(allergenName);
  const cluster = clusterFor(normalized);
  if (cluster) return cluster.keywords;
  const singular = stripTrailingS(normalized);
  return singular === normalized ? [normalized] : [normalized, singular];
}

/**
 * One key per allergen, however a profile spells it — the same normalisation keywordsFor applies
 * (trim, lowercase, synonym cluster, trailing "s"), returned as a key rather than a keyword list:
 * a cluster's first alias, or the singular of an unknown name. "Peanut", "peanut" and "Peanuts" are
 * one key; so are "Milk" and "Dairy"; "Peanut" and "Tree nut" are not.
 *
 * For grouping, not matching: corroboration counts reports by this key (recordCorrection.ts), since
 * profile allergen names are free text and two families rarely type them identically. It is only as
 * fine as the clusters — "Wheat" and "Barley" share a key, as the matcher already treats them.
 * migrations/0043 backfilled existing rows with a SQL copy of this as it stood then; a change here
 * applies to new reports only.
 */
export function allergenKey(allergenName: string): string {
  const normalized = normalizeAllergenName(allergenName);
  return clusterFor(normalized)?.aliases[0] ?? stripTrailingS(normalized);
}

/** The matched characters as they appear in `text`, or null. */
function wordBoundaryMatch(text: string, keyword: string): string | null {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").exec(text)?.[0] ?? null;
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
      const matchedText = wordBoundaryMatch(product.ingredientsText, kw);
      if (matchedText) return { allergenName, matched: true, source: "ingredients", matchedText };
    }
  }
  for (const kw of keywords) {
    if (product.tracesTags.includes(kw)) return { allergenName, matched: true, source: "trace" };
  }

  return { allergenName, matched: false, source: null };
}

/**
 * Whether a product record has anything at all to search — tags or free ingredient text. Exported
 * (rather than kept private to computeVerdict, as it originally was) because the adaptive scan flow
 * (verdict/scanPlan.ts) needs the identical check to decide whether a photo is required, and a
 * second hand-copied version of a safety-relevant boolean is exactly the kind of drift that
 * reintroduces a silent miss. labelScan.ts's own productHasUsableData mirrors this same shape for a
 * different purpose (validating a carried-forward barcode) and is left as its own copy for now.
 */
export function hasUsableData(product: ProductForMatching): boolean {
  return product.found && (product.allergensTags.length > 0 || product.tracesTags.length > 0 || Boolean(product.ingredientsText));
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
  if (!hasUsableData(product)) {
    return { verdict: "unable_to_confirm", matchedAllergens: [] };
  }

  const details: AllergenVerdictDetail[] = allergens.map((allergen) => {
    const result = matchAllergen(allergen.name, product);
    const base = { ...result, severity: allergen.severity };
    if (!result.matched) return { ...base, classification: "clear" };
    if (result.source === "trace" && !allergen.treatTracesAsUnsafe) {
      return { ...base, classification: "caution" };
    }
    return { ...base, classification: "contains" };
  });

  const verdict: Verdict = details.some((d) => d.classification === "contains")
    ? "contains_allergen"
    : details.some((d) => d.classification === "caution")
      ? "may_contain_caution"
      : "safe";

  return { verdict, matchedAllergens: details };
}
