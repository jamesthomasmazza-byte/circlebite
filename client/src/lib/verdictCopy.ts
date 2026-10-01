import type { Verdict } from "./api";

// Plain values, no JSX — the words every verdict is shown with, in one place so the live card and
// scan history can't drift apart on them, and so they can be tested (`npm test -w client`).

/**
 * The verdict headline. Labels only — the `Verdict` values themselves are the server's enum, and
 * `safe` stays as the value.
 *
 * Never the word "Safe" (Prof. Yoest's Oct 1 directive, CONTEST_RULES.md §3a): a label can be clean
 * and the product still carry cross-contact risk, so the clean verdict says what was actually
 * checked — no allergen on this profile's list was found — not what that implies about eating it.
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  safe: "No listed allergens found",
  contains_allergen: "Contains an allergen",
  may_contain_caution: "May contain — caution",
  unable_to_confirm: "Unable to confirm",
};

// Exact wording from docs/verdict-engine.md §"non-negotiables" — renders on every verdict card,
// unconditionally, not just when something matched.
export const DISCLAIMER =
  "This is a screening aid, not a guarantee — always check the physical label, especially for “may contain” warnings.";

// Prof. Yoest's Oct 1 directive (CONTEST_RULES.md §3a): the emergency referral sits with the
// disclaimer wherever a verdict is shown — the live card and scan history — never only in settings.
export const EMERGENCY = "If anyone has an allergic reaction, call 911.";
