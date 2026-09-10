import type { AllergenVerdictDetail } from "../matcher/match.js";
import type { ProfileAllergen } from "./types.js";

// Bump whenever SYSTEM_PROMPT or buildUserPrompt's shape changes — stored alongside every
// verdict_explanations row so a past verdict can be reconstructed (docs/verdict-engine.md rule 8).
export const PROMPT_VERSION = "path-b-v1";

// Safety framing lives here, once, rather than repeated per call site — this is what keeps the
// model's output honest enough for mergeVerdict() to trust structurally rather than re-litigate.
export const SYSTEM_PROMPT = `You are an allergen-screening assistant for CircleBite. You read a
product's free-text ingredient list and report, for each named allergen, whether the evidence in
that text shows it is present.

Rules you must follow exactly:
1. You may only report what the ingredient text actually supports. Never guess, infer from a
   product category, or use outside knowledge about what a product "usually" contains.
2. For every finding you report, citedSpan must be an exact, verbatim substring copied from the
   ingredient text — the same characters, same order. Do not paraphrase, translate, or summarize
   it. A finding whose span cannot be found verbatim in the source text will be discarded.
3. If a term in the ingredient text might relate to an allergen but you are not confident which
   allergen it maps to, or whether it counts as that allergen at all, report present: "unknown"
   for that allergen (or add the raw term to unresolvedTerms) rather than guessing "yes" or "no".
4. Some allergens will already be marked as confirmed present by a separate keyword match — you
   do not need to re-find those; they are provided only for context.
5. You are never asked to clear or contradict a keyword match. Your only job is to resolve
   allergens the keyword match left undetermined.
6. Output structured findings only, one entry per allergen you were asked to evaluate. Do not
   include any allergen not on the provided list.`;

export type PromptInput = {
  allergens: ProfileAllergen[];
  ingredientsText: string;
  deterministicHits: AllergenVerdictDetail[];
};

/**
 * Everything the model needs and nothing else — allergen names and severities only, per rule 7
 * (docs/verdict-engine.md): no profile names, labels, or ages ever reach the prompt.
 */
export function buildUserPrompt({ allergens, ingredientsText, deterministicHits }: PromptInput): string {
  const hitsByName = new Map(deterministicHits.map((h) => [h.allergenName.toLowerCase(), h]));

  const allergenLines = allergens.map((a) => {
    const hit = hitsByName.get(a.name.toLowerCase());
    const status = hit?.classification === "contains" ? " (already confirmed present by keyword match)" : "";
    const traceNote = a.treatTracesAsUnsafe ? ", traces must be treated as unsafe for this allergen" : "";
    return `- ${a.name} (severity: ${a.severity}${traceNote})${status}`;
  });

  return `Allergens to evaluate:
${allergenLines.join("\n")}

Ingredient text (verbatim, from the product label):
"""
${ingredientsText}
"""

For each allergen above that is not already confirmed present, determine whether the ingredient
text shows it is present, present only as a trace/may-contain warning, absent, or unresolvable.
Cite the exact substring of the ingredient text that supports your finding. List any ingredient
term you could not confidently classify in unresolvedTerms.`;
}
