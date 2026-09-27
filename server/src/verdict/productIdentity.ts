/**
 * Whether a photographed label's own extracted product name plausibly names the same product as
 * the scanned barcode's Open Food Facts record — the gate before a combined scan is allowed to
 * merge the two (docs/verdict-engine.md Path D). `matched: null` means there was nothing usable to
 * compare (no OFF name, or the label had no visible product name) — not a mismatch, just no basis
 * for a claim either way.
 */
export type IdentityComparison = { matched: boolean; note: string } | { matched: null; note: null };

// Packaging noise that must never count as identifying evidence on its own — a size, count, or
// filler word overlapping between two genuinely different products (the safety-relevant case:
// two different allergen sources under the same brand and pack format) would otherwise mask a real
// mismatch instead of catching one.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "with", "of", "in", "for",
  "oz", "fl", "ct", "ml", "l", "g", "kg", "lb", "lbs", "pk", "pack", "count",
]);

function significantTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[.,()'"®™\-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

/**
 * Deliberately the loosest defensible rule, not a tuned threshold: mismatch only when the two names
 * share ZERO significant tokens after stripping punctuation, casing, and packaging noise (sizes,
 * counts, unit words). Anything else — a brand prefix the label has and OFF doesn't, a variant
 * descriptor OFF has and the label doesn't, different capitalization or punctuation, one name being
 * a subset of the other's words — counts as a match.
 *
 * This is intentionally biased toward proceeding: a false block interrupts every combined scan a
 * family runs, while the harm case (two genuinely different products merged into one verdict) is
 * rare. See productIdentity.test.ts for why this specific rule was chosen — it's checked against
 * every real Open Food Facts name this project has actually fetched during development, not
 * invented strings, and there are only three of those to check against. That is not enough to
 * derive a numeric similarity threshold with any real confidence, which is exactly why this rule
 * isn't one: "shares nothing at all" is a binary check, not a tuned cutoff, and it's meant to be
 * revisited (BACKLOG) once real combined scans exist to test against actual OCR output, not just
 * Open Food Facts' side of the comparison.
 */
export function compareProductIdentity(offName: string | null, extractedName: string | null): IdentityComparison {
  const off = offName?.trim();
  const extracted = extractedName?.trim();
  if (!off || !extracted) return { matched: null, note: null };

  const offTokens = significantTokens(off);
  const extractedTokens = significantTokens(extracted);
  if (offTokens.size === 0 || extractedTokens.size === 0) return { matched: null, note: null };

  const sharesToken = [...offTokens].some((t) => extractedTokens.has(t));
  return sharesToken
    ? { matched: true, note: `"${off}" and "${extracted}" share at least one identifying word` }
    : { matched: false, note: `"${off}" and "${extracted}" share no identifying words in common` };
}
