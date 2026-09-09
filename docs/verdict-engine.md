# Verdict Engine — build spec

The AI layer. Contest rubric weights this at **20%**, plus most of the 5-point ethical AI bonus.
Governed by `../CONTEST_RULES.md` §3. Safety rules in this document are requirements, not defaults.

## Three input paths

| Path | Situation | Today | With this spec |
|------|-----------|-------|----------------|
| A | Barcode found, structured allergen tags present | Works | Unchanged; AI only writes the explanation |
| B | Barcode found, only a messy `ingredients_text` string | `unable_to_confirm` | Model parses and resolves it |
| C | No barcode, or product absent entirely | Impossible | Photograph the panel, OCR, then Path B |
| D | Barcode found **and** the label photographed | Not attempted | Reconcile the two — the database is a claim, the package is ground truth |

Paths B, C and D are the reason there is an AI in the product. **Path D is the strongest of them.**

Open Food Facts is crowd-sourced and goes stale — manufacturers reformulate and the record doesn't
follow. The dangerous failure isn't a missing record, it's a record that says *safe* about a product
that has since added milk. No keyword matcher can catch that, because the matcher only ever sees one
source. Reconciling two sources that disagree structurally requires reasoning.

When to ask for the label photo, rather than always:

- The profile has a **severe** allergen — the stakes justify the extra step
- The product record is **stale** (`product_last_updated` more than ~12 months old)
- The record is thin — tags missing, ingredient text short or absent
- The verdict came back `safe` on a product nobody has confirmed before
- The user asks for it

Otherwise the barcode alone is the fast path. Two scans every time is friction that gets the app
abandoned in a grocery aisle.

## Pipeline

1. **Resolve source text** *(deterministic)* — barcode to Open Food Facts, or image to OCR text.
   Cache by barcode in the local `products` table so repeat scans are free and verdicts stay
   reproducible if the upstream record changes.
2. **Run the keyword matcher** *(deterministic)* — synonym clusters against tags and ingredient text.
   Fast, free, auditable. Its hits are ground truth.
3. **Model reasons over the remainder** — send ingredient text and the profile's allergen list.
   Ask for per-allergen finding, the exact triggering substring, a confidence band, and any term it
   could not resolve.
4. **Merge under the safety rule** *(deterministic)* — see below.
5. **Explain with citations** — one or two sentences naming the exact token.
6. **Human overrule** — the correction flow, now able to target the AI verdict.

## Functions

```ts
fetchProduct(barcode: string): Promise<ProductRecord>

extractLabel(image: Blob): Promise<{
  ingredientsText: string
  productName?: string
  contains?: string[]        // "Contains: milk, soy"
  mayContain?: string[]      // "May contain traces of..."
  legible: boolean           // false -> prompt a retake, never guess
  language?: string
}>

crossReference(profile: ProfileAllergen[], product): MatchedAllergen[]   // deterministic

reasonVerdict(input: {
  allergens: { name: string; severity: Severity; treatTracesAsUnsafe: boolean }[]
  ingredientsText: string
  contains?: string[]; mayContain?: string[]
  deterministicHits: MatchedAllergen[]
}): Promise<{
  findings: {
    allergen: string
    present: "yes" | "trace" | "no" | "unknown"
    citedSpan: string        // MUST appear verbatim in ingredientsText
    reason: string
    confidence: "high" | "medium" | "low"
  }[]
  unresolvedTerms: string[]
}>

reconcileSources(input: {
  offRecord: ProductRecord          // what the database claims
  offLastUpdated: Date | null
  labelText: string                 // what the physical package says
  allergens: ProfileAllergen[]
}): Promise<{
  agreement: "consistent" | "label_stricter" | "label_looser" | "different_product"
  allergensOnLabelNotInRecord: { allergen: string; citedSpan: string }[]
  allergensInRecordNotOnLabel: string[]
  recommendation: "trust_label" | "flag_conflict"
  reason: string
}>

mergeVerdict(det: MatchedAllergen[], ai: Findings): {
  verdict: "safe" | "contains_allergen" | "unable_to_confirm"
  confidence: "high" | "medium" | "low"
  disagreements: Disagreement[]
}

explainVerdict(merged, findings): Promise<string>

recordCorrection({ barcode, allergen, type, target: "off_data" | "ai_verdict", explanationId })

aiAccuracyReport(since: Date): { scans, overruled, rate, byAllergen }
```

## Safety rules — assertions in code, not documentation

1. **Fail closed.** Error, timeout, unparseable response, or low confidence produces
   `unable_to_confirm`. Never `safe`. Silence is not clearance.
2. **The model can only escalate.** It may add a caution or resolve an unknown. It may never clear an
   allergen the keyword matcher found.
3. **No claim without a span.** If `citedSpan` is not a substring of the source text, discard the
   finding before it reaches the screen. This is the cheapest hallucination guard available.
4. **The label outranks the database.** When the two sources disagree, the physical package wins and
   the verdict escalates. `label_stricter` — the label names an allergen the record omits — always
   produces `contains_allergen`. `label_looser` — the record flags something the label doesn't — is
   **not** a clearance; it produces `unable_to_confirm` and a correction prompt, because the likelier
   explanation is a bad photo than a wrong database.
5. **A conflict is shown, never resolved silently.** If the sources disagree, the verdict card says
   so and names both readings. That disagreement is also the highest-value correction report the app
   can generate, and it can be contributed back upstream to Open Food Facts.
6. **The human wins.** A user correction overrides the verdict for that product on their profile
   immediately, and enters the review queue for everyone else.
7. **Minimum data in the prompt.** Allergen names and severities only. No names, profile labels, or
   ages — these are health details about real people, often children.
8. **Every verdict is reproducible.** Store model name, prompt version, and exact input alongside the
   output. A verdict that cannot be reconstructed cannot be defended.
9. **The disclaimer renders on the verdict card**, and most prominently on AI-generated verdicts.
   Current wording: *a screening aid, not a guarantee — always check the physical label, especially
   for "may contain" warnings.*

## Confidence bands

Derived from where the evidence came from, never from asking the model how sure it feels.

| Band | Evidence | Shown as |
|------|----------|----------|
| High | Structured allergen tags, or an explicit "Contains:" line | Verdict stated plainly |
| Medium | Free ingredient text — a named ingredient or known derivative (whey, casein, albumen) | Verdict plus the cited ingredient |
| Low | OCR from a photo, a translated label, an ambiguous or additive-coded term | Downgraded to *unable to confirm*, showing what it saw and why it wasn't sure |

## Schema additions

**`verdict_explanations`** — id, scan_id, model, prompt_version, verdict, confidence, findings (json),
unresolved_terms (json), latency_ms, tokens, cost_cents, created_at

**`label_captures`** — id, scan_id, image_path, ocr_text, language, legible, created_at
*(images stored outside the repo, served only through signed access)*

**`products`** (cache) — barcode (pk), name, brand, ingredients_text, allergens_tags, traces_tags, fetched_at

**Changes to existing tables** — `scans`: add `source` (barcode | label_photo | manual) and
`confidence`. `product_corrections`: add `target` (off_data | ai_verdict) and `verdict_explanation_id`.

Write each as a separate, named migration commit.

## Demo sequence — six beats, in this order

1. Scan a well-known product. Instant, high confidence, no AI needed — the boring path is solid.
2. Scan something obscure with a messy ingredient string. Show which **word** made the call.
3. Camera on a label with **no barcode** — the case a database-only app cannot serve.
4. **The headline.** Scan a product whose database record is out of date, then photograph the label.
   The app catches the database being wrong and escalates the verdict. Every competitor trusts the
   record; this one checks it.
5. Show a low-confidence result **refusing to say safe**. Restraint, not a demo tuned to always win.
6. Overrule the model live, then open the accuracy page showing overrule rate by allergen.

## Cost

Roughly half a cent per AI scan at current small-model pricing. Development across the semester
realistically lands between $5 and $25. Use a sandbox key with a hard spend cap, and cache the system
prompt.
