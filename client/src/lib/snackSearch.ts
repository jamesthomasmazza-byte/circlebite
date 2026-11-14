// Snack search's words and its hand-off to Scan (docs/snack-list-plan.md addendum, 2026-11-14; behind
// SNACK_SEARCH). Plain values, under test. Never the word "safe" (CONTEST_RULES.md §3a), and never a
// verdict here: a result is a product to open, not a product that was checked.

export const QUERY_MIN = 2;
export const QUERY_MAX = 80;

/** The section's own name, distinct from the field's so a screen reader hears two things, not one twice. */
export const SEARCH_REGION = "Snack search";
export const SEARCH_LABEL = "Search for a product";
export const SEARCH_PLACEHOLDER = "Name or brand";
export const SEARCH_BUTTON = "Search";
export const SEARCHING = "Searching…";
export const TOO_SHORT = "Type at least two characters.";
export const SEARCH_FAILED = "Couldn't search. Try again.";

/** Under the results, every time: what tapping does and doesn't do. */
export function pickLine(profile: { label: string; is_self: boolean }): string {
  const who = profile.is_self ? "you" : profile.label;
  return `Tap a product to scan it for ${who}. A result isn't checked until it's opened, and nothing goes on the list by itself.`;
}

export function localEmptyLine(query: string): string {
  return `Nothing called “${query}” among the products this app has seen.`;
}

/** No local match, so Open Food Facts was asked at once (JT, Nov 14), and it had none either. */
export function nothingAnywhereLine(query: string): string {
  return `Nothing called “${query}” in this app's records or on Open Food Facts.`;
}

export const SEARCH_MORE = "Search more";
export const SEARCHING_MORE = "Asking Open Food Facts…";
export const MORE_HEADING = "More from Open Food Facts";
export const MORE_EMPTY = "Open Food Facts has no match either.";
export const MORE_UNAVAILABLE = "Couldn't reach Open Food Facts right now. Try again in a moment.";
export const MORE_BUSY = "Open Food Facts search is busy right now. Try again in a minute.";
export const MORE_LIMIT = "That's this hour's limit for outside searches. This app's own records still answer.";

/** What a "Search more" failure says, by the server's error code. */
export function moreFailureLine(code: string): string {
  switch (code) {
    case "search_limit":
      return MORE_LIMIT;
    case "search_busy":
      return MORE_BUSY;
    case "search_unavailable":
      return MORE_UNAVAILABLE;
    default:
      return SEARCH_FAILED;
  }
}

export const UNNAMED = "Unnamed product";

// ---- Adding straight from a result (JT, Nov 14; managers only) ----
// The Add button runs the same scan the Scan page would for that barcode and the chosen profile, on
// the server, and then the existing add by scan id — the list's barcode comes from the scan row.
export const ADD_BUTTON = "Add";
export const ADD_CHECKING = "Checking…";
export const ADD_ADDING = "Adding…";
/** The result's own name button: what tapping the name does, said once under the list. */
export function pickLineWithAdd(profile: { label: string; is_self: boolean }): string {
  const who = profile.is_self ? "you" : profile.label;
  return `Add checks the product for ${who} first and puts it on the list; tap the name instead to see its full card.`;
}

/** "Crunchy Peanut Bar — Hearthfield", or whichever of the two there is. */
export function resultTitle(result: { name: string | null; brand: string | null }): string {
  if (result.name && result.brand) return `${result.name} — ${result.brand}`;
  return result.name ?? result.brand ?? UNNAMED;
}

// ---- The hand-off to Scan ----
//
// A barcode is never read from the URL (lib/sampleScan.ts, lib/judgeLink.ts, lib/snackListCopy.ts).
// Tapping a result navigates to Scan for the chosen profile with the barcode in the router's location
// state, which lives in the browser's history entry and never in the address, a link or a log. Scan
// reads it once (pickedBarcode), runs the existing typed-barcode scan, and clears it.

export const PICKED_BARCODE_KEY = "snackSearchBarcode";

/** Digits, 6 to 14: what Scan's typed form accepts (Scan.tsx runScan). */
const BARCODE_SHAPE = /^\d{6,14}$/;

export function scanPathFor(profileId: string): string {
  return `/scan?profile=${encodeURIComponent(profileId)}`;
}

export function scanStateFor(barcode: string): Record<string, string> {
  return { [PICKED_BARCODE_KEY]: barcode };
}

/** The barcode a result tap carried in location state, or null for anything else. */
export function pickedBarcode(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[PICKED_BARCODE_KEY];
  return typeof value === "string" && BARCODE_SHAPE.test(value) ? value : null;
}
