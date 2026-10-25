import type { Severity } from "./api";

// The severity choice for a new allergen (2026-10-25). No default in either direction: a parent
// picks one, because a default either understates the reaction or shows the allergen to severe-only
// followers without anyone deciding to (docs/principles.md). Plain values, under test.

export const SEVERITY_CHOICES: { value: Severity; label: string; line: string }[] = [
  {
    value: "mild",
    label: "Mild",
    line: "Discomfort, not danger. Left off the profile page for 'severe only' followers; their scans still check it.",
  },
  {
    value: "moderate",
    label: "Moderate",
    line: "A clear reaction that needs attention. Left off the profile page for 'severe only' followers; their scans still check it.",
  },
  {
    value: "severe",
    label: "Severe",
    line: "Any trace could cause a serious reaction. Shown to every follower, including 'severe only', and scans offer a label photo.",
  },
];

/** Said when an allergen is picked and its severity isn't. */
export const SEVERITY_REQUIRED = "Choose how severe each allergen is: mild, moderate or severe.";
