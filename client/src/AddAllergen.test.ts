import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AddAllergen } from "./AddAllergen";
import type { AllergenChoice } from "./lib/api";

// "Add an allergen" as a button (2026-11-05, BACKLOG item 9): closed, it's one button and no form;
// open, it's the same form as before, with no severity chosen. An empty profile starts open
// (docs/principles.md, Nov 5): it reads "No listed allergens found" on every scan.

const CHOICES: AllergenChoice[] = [
  { key: "egg", displayName: "Egg", group: "common", hint: null, spellings: ["egg"] },
  { key: "peanut", displayName: "Peanut", group: "common", hint: null, spellings: ["peanut"] },
] as AllergenChoice[];

function render(startOpen: boolean, choices: AllergenChoice[] | null = CHOICES): string {
  return renderToStaticMarkup(createElement(AddAllergen, { choices, startOpen, onAdd: async () => {} }));
}

test("closed, it's one button and no form", () => {
  const html = render(false);
  assert.match(html, /<button type="button">Add an allergen<\/button>/);
  assert.doesNotMatch(html, /<form|type="radio"|Treat traces as unsafe/);
});

test("an empty profile starts with the form open", () => {
  const html = render(true);
  assert.match(html, /<form/);
  assert.match(html, /Add an allergen/, "the picker is labelled as before");
  assert.match(html, /How severe is it\?/);
  assert.match(html, /<button type="submit">Add allergen<\/button>/);
  assert.match(html, /<button type="button">Cancel<\/button>/);
});

test("open, no severity is chosen and traces start as unsafe, as on the classic form", () => {
  const html = render(true);
  const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
  assert.equal(radios.length, 3, "Mild, Moderate and Severe");
  for (const r of radios) {
    assert.doesNotMatch(r, /checked/, `no default: ${r}`);
    assert.match(r, /required/);
  }
  assert.match(html, /<input type="checkbox" checked=""/);
});

test("before the choices load, the open form still asks for a severity and shows no picker", () => {
  const html = render(true, null);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /How severe is it\?/);
});

test("PROFILE_REDESIGN: with the header's button the way in, a closed form shows no second button", () => {
  // JT, 2026-11-06: managers saw "Add an allergen" twice. Today's page keeps its button (the default).
  assert.match(render(false), /<button type="button">Add an allergen<\/button>/);
  const closedHidden = renderToStaticMarkup(createElement(AddAllergen, { choices: CHOICES, startOpen: false, onAdd: async () => {}, showOpenButton: false }));
  assert.equal(closedHidden, "");
  const opened = renderToStaticMarkup(createElement(AddAllergen, { choices: CHOICES, startOpen: true, onAdd: async () => {}, showOpenButton: false }));
  assert.match(opened, /<form/, "an empty profile still opens with the form, as today");
});
