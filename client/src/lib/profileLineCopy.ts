import type { ProfileSummary } from "./api";

// The line under a profile's name that tells two profiles apart when they look alike — in Scan's
// "Scanning for" and on the Profile tab (2026-10-25). Its allergens, short. Plain values, under test.

type LineProfile = Pick<ProfileSummary, "allergen_names" | "share_level">;

const SHOWN = 3;

/**
 * Up to three names, then how many more. An empty list never reads as "no allergens" to a
 * severe_only follower: the server sent only the severe ones, so the rest may exist (principle 2).
 */
export function allergenLine({ allergen_names, share_level }: LineProfile): string {
  if (allergen_names.length === 0) {
    return share_level === "severe_only" ? "Only severe allergens are shared with you" : "No allergens on this profile yet";
  }
  const shown = allergen_names.slice(0, SHOWN).join(", ");
  const more = allergen_names.length - SHOWN;
  return more > 0 ? `${shown} +${more} more` : shown;
}

function relationshipWord(p: Pick<ProfileSummary, "relationship">): string {
  if (p.relationship === "owner") return "you own";
  if (p.relationship === "co_manager") return "co-manager";
  return "you follow";
}

/**
 * The text of one "Scanning for" option — a native option holds one line, so the name and its line
 * share it. When another profile still reads the same, how you hold this one is added.
 */
export function profileOptionText(
  p: Pick<ProfileSummary, "id" | "label" | "allergen_names" | "share_level" | "relationship">,
  all: Pick<ProfileSummary, "id" | "label" | "allergen_names" | "share_level">[],
): string {
  const text = `${p.label} · ${allergenLine(p)}`;
  const twin = all.some((o) => o.id !== p.id && `${o.label} · ${allergenLine(o)}` === text);
  return twin ? `${text} (${relationshipWord(p)})` : text;
}
