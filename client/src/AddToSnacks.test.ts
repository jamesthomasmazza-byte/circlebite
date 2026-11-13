import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AddToSnacksView, type AddState } from "./AddToSnacks";
import type { MatchedAllergen } from "./lib/api";

// "Add to Maya's snacks" under the verdict card (docs/snack-list-plan.md, 2026-11-13; behind SNACK_LIST).

const MAYA = { id: "p-maya", label: "Maya", is_self: false };
const ROWS: Pick<MatchedAllergen, "allergenName" | "classification">[] = [
  { allergenName: "Peanut", classification: "contains" },
  { allergenName: "Sesame", classification: "clear" },
];
const noop = () => {};

function render(state: AddState, verdict: Parameters<typeof AddToSnacksView>[0]["verdict"] = "contains_allergen"): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(AddToSnacksView, { state, profile: MAYA, verdict, matched: ROWS, onOpen: noop, onConfirm: noop, onCancel: noop }),
    ),
  );
}

test("idle: one button, named for the profile", () => {
  const html = render({ kind: "idle" });
  assert.match(html, /<button type="button" class="snack-add__open">Add to Maya&#x27;s snacks<\/button>/);
  assert.doesNotMatch(html, /role="alert"|role="status"/);
});

test("the confirm step says the verdict's label and the allergens it warns about, with Don't add as the primary", () => {
  const html = render({ kind: "confirm" });
  assert.match(html, /<h3 id="snack-add-confirm-heading">This product reads “Contains an allergen”<\/h3>/);
  assert.match(html, /contains an allergen for Maya: Peanut\./, "the clear row isn't named as a warning");
  assert.match(html, /won&#x27;t offer to shop for it/);
  assert.match(html, /<button type="button">Add it anyway<\/button><button type="button" class="button-primary">Don&#x27;t add<\/button>/);
});

test("added and already-listed both say so and link to the list", () => {
  const added = render({ kind: "added" });
  assert.match(added, /<p role="status" class="snack-add__done">Added to Maya&#x27;s snacks\. <a href="\/snacks\?profile=p-maya"[^>]*>View the list<\/a><\/p>/);
  const already = render({ kind: "already" });
  assert.match(already, /Already on Maya&#x27;s snacks\. <a href="\/snacks\?profile=p-maya"[^>]*>View the list<\/a>/);
});

test("an error keeps the button, so the parent can try again", () => {
  const html = render({ kind: "error", message: "Couldn't add it. Try again in a moment." });
  assert.match(html, /<p role="alert">Couldn&#x27;t add it\. Try again in a moment\.<\/p>/);
  assert.match(html, /snack-add__open/);
});

test("never the word 'safe' in any state", () => {
  for (const state of [{ kind: "idle" }, { kind: "confirm" }, { kind: "added" }, { kind: "already" }] as AddState[]) {
    assert.doesNotMatch(render(state, "may_contain_caution"), /\bsafe\b/i);
  }
});

// Scan.tsx: the button is for managers of the card's profile, with a barcode, never on the sample,
// and the component posts the scan id only.
const SCAN = readFileSync(new URL("./routes/Scan.tsx", import.meta.url), "utf8");
const COMPONENT = readFileSync(new URL("./AddToSnacks.tsx", import.meta.url), "utf8");

test("Scan shows it only with the switch on, for a manager of the card's profile, on a barcode scan that isn't the sample", () => {
  const open = SCAN.indexOf("<AddToSnacks");
  assert.ok(open > 0, "rendered by Scan");
  const guard = SCAN.slice(SCAN.lastIndexOf("{snackListEnabled", open), open);
  for (const term of ["snackListEnabled", "managedProfiles.some", "result.barcode", "!isSampleScan(result.barcode)"]) {
    assert.ok(guard.includes(term), `guarded by ${term}`);
  }
  assert.match(COMPONENT, /addSnack\(profile\.id, scanId\)/, "the scan id, never a barcode");
});

test("Contains and May contain go through the confirm step; the others save at once", () => {
  assert.match(COMPONENT, /needsConfirm\(verdict\) \? setState\(\{ kind: "confirm" \}\) : void save\(\)/);
});
