import type { MatchedAllergen, Verdict } from "./api";
import { VERDICT_LABEL } from "./verdictCopy";

// Snack lists' words (docs/snack-list-plan.md, 2026-11-13). Plain values, under test. Never the word
// "safe" (CONTEST_RULES.md §3a): a list item's verdict is the card's own label (verdictCopy.ts), and
// the list is "<name>'s snacks", each item "Approved by <who>, <date>" — approved by a person, not
// cleared by the app.

export const SNACKS_PATH = "/snacks";

/** The Snacks tab's page for one profile, which the shell takes as the chosen profile (lib/tabs.ts). */
export function snacksPath(profileId: string): string {
  return `${SNACKS_PATH}?profile=${encodeURIComponent(profileId)}`;
}

/**
 * "Label wrong? Report a correction" on a Contains item: Scan, on that profile, scanning the item's
 * product once and opening the report form (Scan.tsx). The item's id, not its barcode: a barcode is
 * never read from the URL (lib/sampleScan.ts, lib/judgeLink.ts); Scan looks the item up and the
 * server says what it is.
 */
export function snackReportPath(profileId: string, itemId: string): string {
  return `/scan?profile=${encodeURIComponent(profileId)}&snack=${encodeURIComponent(itemId)}`;
}

/** The item Scan should scan and open a report for, or null. */
export function wantsSnackReport(search: string): string | null {
  const id = new URLSearchParams(search).get("snack");
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** "Maya's snacks", or "Your snacks" for a profile that is the account holder's own. */
export function listTitle(profile: { label: string; is_self: boolean }): string {
  return profile.is_self ? "Your snacks" : `${profile.label}'s snacks`;
}

export function addButtonLabel(profile: { label: string; is_self: boolean }): string {
  return `Add to ${profile.is_self ? "your" : `${profile.label}'s`} snacks`;
}

/** A warning verdict needs a confirm step that says what the warning is (plan decision 2). */
export function needsConfirm(verdict: Verdict): boolean {
  return verdict === "contains_allergen" || verdict === "may_contain_caution";
}

/** The allergens the card is warning about, for the confirm step: the rows that claim presence. */
export function warnedAllergens(matched: Pick<MatchedAllergen, "allergenName" | "classification">[]): string[] {
  return matched.filter((m) => m.classification === "contains" || m.classification === "caution").map((m) => m.allergenName);
}

export function confirmHeading(verdict: Verdict): string {
  return `This product reads “${VERDICT_LABEL[verdict]}”`;
}

export function confirmLine(profile: { label: string; is_self: boolean }, verdict: Verdict, allergens: string[]): string {
  const who = profile.is_self ? "you" : profile.label;
  const which = allergens.length > 0 ? ` for ${who}: ${allergens.join(", ")}` : ` for ${who}`;
  const warning =
    verdict === "contains_allergen"
      ? `Its data says it contains an allergen${which}.`
      : `Its data says it may contain an allergen${which}.`;
  return `${warning} The warning stays on the list for good, and the list won't offer to shop for it while it reads “Contains an allergen”. Add it anyway?`;
}

export const CONFIRM_ADD = "Add it anyway";
export const CONFIRM_CANCEL = "Don't add";

export function addedLine(profile: { label: string; is_self: boolean }): string {
  return `Added to ${profile.is_self ? "your" : `${profile.label}'s`} snacks.`;
}

export function alreadyListedLine(profile: { label: string; is_self: boolean }): string {
  return `Already on ${profile.is_self ? "your" : `${profile.label}'s`} snacks.`;
}

export const VIEW_LIST = "View the list";
export const ADD_FAILED = "Couldn't add it. Try again in a moment.";
/** The scan's product has no record to list (server 409 product_not_on_file). */
export const NOT_ON_FILE = "This product isn't on file yet, so it can't go on the list.";

// ---- The list page ----

export function approvedBy(name: string | null, when: string): string {
  return name ? `Approved by ${name}, ${when}` : `Approved ${when}`;
}

/**
 * An item's allergens the matcher cleared but nothing reliable checked (server snackList/itemVerdict.ts:
 * a text-only product the model never read for them, or whose text has changed). Named, as on a scan
 * card: uncertainty is shown, never folded away (docs/principles.md principle 2).
 */
export function notCheckedLine(names: string[]): string {
  if (names.length === 0) return "";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Not checked for ${list}: this product's record has only ingredient text, and it hasn't been read for ${names.length === 1 ? "it" : "them"}. Scan it to check.`;
}

/** On every item: whoever checks out may get a different version of the product. */
export const SCAN_WHEN_IT_ARRIVES = "Scan it when it arrives — stores can send a different version.";

export const SHOP_AMAZON = "Shop on Amazon";
export const SHOP_INSTACART = "Shop on Instacart";

/** On a "Contains" item, into the existing correction flow (Scan's report form). */
export const LABEL_WRONG = "Label wrong? Report a correction";

export const REMOVE = "Remove";
export const ADD_NOTE = "Add a note";
export const EDIT_NOTE = "Edit note";
export const NOTE_LABEL = "Note";
export const NOTE_SAVE = "Save note";
export const NOTE_CANCEL = "Cancel";
export const NOTE_MAX = 200;

/** A follower's empty list. A manager with an empty list sees only the search box (JT, Nov 14). */
export function emptyLine(profile: { label: string; is_self: boolean }, canManage: boolean): string {
  const whose = profile.is_self ? "your" : `${profile.label}'s`;
  return canManage ? "" : `Nothing on ${whose} list yet.`;
}

export const NO_PROFILE = "Snack lists belong to a profile. Add one, or accept an invite, and the list appears here.";

export const AFFILIATE_DISCLOSURE = "Amazon links may earn CircleBite a commission. That never changes a verdict or the order of this list.";

export const LIST_FAILED = "Couldn't load the list — you may not have access to this profile.";

// ---- Carts (the plan's addendum part B, 2026-11-14; behind SNACK_CARTS). Amazon only. ----

export const LINK_AMAZON = "Link on Amazon";
export const CHANGE_AMAZON_LINK = "Change Amazon link";
export const REMOVE_AMAZON_LINK = "Remove Amazon link";
export const LINK_AMAZON_LABEL = "The product's amazon.com link";
export const LINK_AMAZON_HINT = "Open the product on amazon.com and copy the address. Only the product code is kept.";
export const LINK_SAVE = "Save link";
export const LINK_INVALID = "That isn't an amazon.com product link. Copy the address from the product's page on amazon.com.";
/** A share link (a.co, amzn.to, amzn.com) says nothing about the product without being followed, which the server never does. */
export const LINK_SHORT = "Short share links can't be used. Open the product on amazon.com (in Safari or Chrome) and copy the address from the address bar.";
export const LINK_FAILED = "Couldn't save the link. Try again.";

const SHORT_LINK_HOSTS = ["a.co", "amzn.to", "amzn.com", "amzn.eu", "amzn.asia"];

/** True for Amazon's share links, by host — the ones the server refuses because resolving them would mean fetching them. */
export function isShortAmazonLink(raw: string): boolean {
  const text = raw.trim();
  let host: string;
  try {
    host = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SHORT_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** What the card says when the server refuses a pasted link: the short-link line for a share link, else the general one. */
export function linkRefusedLine(pasted: string): string {
  return isShortAmazonLink(pasted) ? LINK_SHORT : LINK_INVALID;
}

export function amazonLinkedBy(name: string | null, when: string): string {
  return name ? `Amazon link added by ${name}, ${when}` : `Amazon link added ${when}`;
}

/** The checkbox's own label, one per item, so a screen reader hears which product it is. */
export function selectForCartLabel(productName: string | null): string {
  return `Select ${productName ?? "this product"} for the Amazon cart`;
}

export function cartButtonLabel(count: number): string {
  return count > 0 ? `Add selected to Amazon cart (${count})` : "Add selected to Amazon cart";
}

export const CART_BUILDING = "Building the cart…";
export const OPEN_CART = "Open the Amazon cart";
export const CART_FAILED = "Couldn't build the cart. Try again.";
export const CART_NOTHING = "Nothing could go in the cart.";
/** Under the cart link, every time: what happens next and the standing rule. */
export const CART_NOTE = "Amazon opens in a new tab with these items in its add-to-cart step; sign in there to finish. Scan each item when it arrives.";

function nameList(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function cartIncludedLine(count: number): string {
  return count === 1 ? "1 item is in the cart link." : `${count} items are in the cart link.`;
}

/** Selected, allowed, but no Amazon link yet — named, so a manager knows what to link. */
export function leftOutLine(names: string[]): string {
  if (names.length === 0) return "";
  return `Left out, no Amazon link yet: ${nameList(names)}.`;
}

/** Selected, but the server's own re-check reads "Contains an allergen" now. */
export function refusedLine(names: string[]): string {
  if (names.length === 0) return "";
  return `Not added — ${names.length === 1 ? "it reads" : "they read"} “Contains an allergen” now: ${nameList(names)}.`;
}

/** The profile page's link to the list (plan step 9). */
export const SNACKS_LINK = "Snacks →";

/** "Nov 13", with the year only when it isn't this one — the date on "Approved by", no time of day. */
export function shortDate(value: string | Date, now: Date = new Date(), opts: { locale?: string; timeZone?: string } = {}): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const yearOf = (d: Date) => new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: opts.timeZone }).format(d);
  return new Intl.DateTimeFormat(opts.locale, {
    month: "short",
    day: "numeric",
    year: yearOf(date) === yearOf(now) ? undefined : "numeric",
    timeZone: opts.timeZone,
  }).format(date);
}
