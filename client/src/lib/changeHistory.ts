import type { ProfileHistoryEntry } from "./api";

// The change history on the profile page, collapsed (2026-11-05, BACKLOG item 8). Condition 2: what
// the owner hasn't acknowledged never sits behind a tap — it comes first, in a block that doesn't
// collapse, and only entries already seen go in the collapsed list. Plain values, under test.

export type SplitHistory = { unseen: ProfileHistoryEntry[]; seen: ProfileHistoryEntry[] };

/** Unseen and seen, each in the server's order. An unseen entry is never in `seen`, whatever its date. */
export function splitHistory(entries: readonly ProfileHistoryEntry[]): SplitHistory {
  return { unseen: entries.filter((e) => e.unseen), seen: entries.filter((e) => !e.unseen) };
}

export const UNSEEN_HEADING = (count: number) => `New, not yet reviewed (${count})`;

/** N counts only what the collapsed list holds — the number matches what opens. */
export function collapsedSummary(seenCount: number, hasUnseen: boolean): string {
  return hasUnseen ? `Earlier changes (${seenCount})` : `Change history (${seenCount})`;
}

export const ACKNOWLEDGE = "I've seen these";
export const NO_CHANGES = "No changes recorded yet.";
export const HISTORY_FAILED = "Couldn't load this profile's change history. Reload the page to try again.";
export const ACK_FAILED = "Couldn't record that. Try again.";
