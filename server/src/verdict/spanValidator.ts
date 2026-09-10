/**
 * Safety rule 3 (docs/verdict-engine.md): if a model's citedSpan is not a verbatim substring of
 * the source text, discard the finding before it reaches the screen. Case-insensitive only — the
 * source text's own casing varies by manufacturer, but the span itself still has to be an exact
 * substring, never a paraphrase or a synonym the model supplied on its own.
 */
export function validateSpan(citedSpan: string, sourceText: string): boolean {
  const span = citedSpan.trim();
  if (span.length === 0) return false;
  return sourceText.toLowerCase().includes(span.toLowerCase());
}
