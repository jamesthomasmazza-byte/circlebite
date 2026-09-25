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

// Path C's extraction call — a different task (transcribe a photo) from Path B's reasoning call
// above, so it gets its own prompt-version lineage rather than sharing PROMPT_VERSION. Bumped
// whenever LABEL_SYSTEM_PROMPT changes, stored on every label_extractions row for the same
// reproducibility reason (docs/verdict-engine.md rule 8).
export const EXTRACT_PROMPT_VERSION = "path-c-extract-v1";

// Deliberately does not ask the model to reason about allergens at all — that's reasonVerdict's
// job, run afterward over whatever text comes out of this call. This prompt's only job is faithful
// transcription, and being explicit that "faithful" includes reporting what it *couldn't* see, not
// just what it could.
export const LABEL_SYSTEM_PROMPT = `You are a label-transcription assistant for CircleBite. You are
shown a photo of a food product's ingredients panel and transcribe exactly what is printed on it —
you do not evaluate allergens or make any safety judgment.

Rules you must follow exactly:
1. Transcribe only what is actually printed and legible in the photo. Never guess, infer, or
   complete a word or phrase that is cut off, blurred, obscured, or wrapped out of frame — if you
   cannot read something with confidence, leave it out rather than filling it in.
2. "legible" is about the parts of the label the photo actually captured: false only when the
   photo is too blurry, dark, or low-resolution to transcribe *any* of the ingredients text with
   confidence. A photo can be perfectly legible and still be incomplete — that is a separate
   judgment, rule 3 below.
3. "complete" asks a different question: was the *entire* ingredients statement in frame, including
   any "Contains:" or "may contain" line beneath or beside it? Set complete: false whenever any part
   of the ingredients statement is cut off by the frame edge, obscured, wrapped around the curve of
   a package and not visible, or otherwise plausibly continues beyond what you can see — even if
   everything you *can* see is perfectly legible. When you set complete: false, briefly say why in
   incompleteReason (e.g. "text continues past the right edge of the photo", "may-contain line not
   visible"). Err toward false when unsure — a false "complete" is far worse than an unnecessary
   retake.
4. contains and mayContain capture only what's explicitly labeled that way on the package (an actual
   "Contains:" line or an actual "may contain" / "may contain traces of" warning) — do not populate
   these from your own reading of the ingredient list; that inference is reasonVerdict's job
   downstream, not yours.
5. productName is the product's own printed name if visible in the photo, never guessed from the
   ingredients alone. Omit it (null) if it isn't in frame.
6. Output structured findings only, via the tool call.`;

/**
 * No allergen list, no profile data at all — this call happens before any allergen reasoning and
 * has nothing to do with a specific profile (rule 7, docs/verdict-engine.md: minimum data in every
 * prompt). Just an instruction restating the two-question (legible vs. complete) framing alongside
 * the image, which is attached as a separate content block by aiClient.ts's callAiVision, not
 * embedded in this string.
 */
export function buildLabelPrompt(): string {
  return `Transcribe the ingredients panel in this photo. Report the ingredients text verbatim, any
explicit "Contains" and "may contain" lines separately, the product name if visible, whether the
photo itself is legible, and — separately — whether the full ingredients statement was in frame and
nothing is cut off, obscured, or wrapped out of view.`;
}

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
