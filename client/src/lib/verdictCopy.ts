import type { Verdict } from "./api";

// Plain values, no JSX — the words every verdict is shown with, in one place so the live card and
// scan history can't drift apart on them, and so they can be tested (`npm test -w client`).

/** The verdict headline. Labels only — the `Verdict` values themselves are the server's enum. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  safe: "Safe",
  contains_allergen: "Contains an allergen",
  may_contain_caution: "May contain — caution",
  unable_to_confirm: "Unable to confirm",
};

// Exact wording from docs/verdict-engine.md §"non-negotiables" — renders on every verdict card,
// unconditionally, not just when something matched.
export const DISCLAIMER =
  "This is a screening aid, not a guarantee — always check the physical label, especially for “may contain” warnings.";
