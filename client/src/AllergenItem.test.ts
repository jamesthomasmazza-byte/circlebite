import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AllergenItem } from "./AllergenItem";
import type { Allergen } from "./lib/api";
import { tracesNote } from "./lib/profileAllergenCopy";

// The profile page's compact allergen row (2026-11-05, BACKLOG item 9a). Visible without a tap: the
// severity, the traces setting and any "needs a look" notice. A closed <details> hides what's inside
// it, so "visible without a tap" means "in the <summary>, or outside the <details>".

const PEANUT: Allergen = {
  id: "a1",
  name: "Peanut",
  severity: "severe",
  notes: "Carries an EpiPen.",
  treat_traces_as_unsafe: true,
  allergen_key: "peanut",
  key_needs_review: false,
};

function render(allergen: Allergen, canManage: boolean, review?: string): string {
  return renderToStaticMarkup(
    createElement(AllergenItem, {
      allergen,
      canManage,
      review: review ? createElement("div", { role: "note", className: "allergen-review" }, review) : undefined,
      onUpdate: async () => {},
      onRemove: async () => {},
    }),
  );
}

function summary(html: string): string {
  return html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
}

function inside(html: string): string {
  return html.slice(html.indexOf("<details"), html.indexOf("</details>"));
}

test("the traces setting reads unsafe or caution, never OK", () => {
  assert.equal(tracesNote(true), "traces: unsafe");
  assert.equal(tracesNote(false), "traces: caution");
  for (const v of [true, false]) assert.doesNotMatch(tracesNote(v), /\bok\b|safe\b(?<!unsafe)/i);
});

test("a manager's row: name, severity pill and traces in the summary, closed by default", () => {
  const html = render(PEANUT, true);
  const s = summary(html);
  assert.match(s, /<strong class="allergen-item__name">Peanut<\/strong>/);
  assert.match(s, /<span class="severity-pill" data-severity="severe">/);
  assert.match(s, /traces: unsafe/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  // Read as one sentence: "Peanut (severe), traces: unsafe".
  assert.equal(s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), "Peanut (severe), traces: unsafe");
});

test("the controls are inside the details: severity, traces, notes and Remove", () => {
  const html = render(PEANUT, true);
  const body = inside(html);
  assert.match(body, /<select aria-label="Severity of Peanut"/);
  assert.match(body, /<option value="severe" selected="">Severe<\/option>/);
  assert.match(body, /<input type="checkbox" checked=""/);
  assert.match(body, /<textarea>Carries an EpiPen.<\/textarea>/);
  assert.match(body, /Save notes/);
  assert.match(body, /Remove<span class="visually-hidden"> Peanut<\/span>/);
  assert.doesNotMatch(summary(html), /<select|<input|<textarea|<button/, "nothing operable in the summary");
});

test("a needs-a-look notice shows on the row without a tap, outside the details", () => {
  const html = render({ ...PEANUT, key_needs_review: true }, true, "“treenuts” isn't on the list.");
  const notice = html.indexOf('class="allergen-review"');
  assert.ok(notice > html.indexOf("</details>"), "after the details, not in them");
  assert.doesNotMatch(inside(html), /allergen-review/);
});

test("a caution traces setting and a mild severity show as such on the row", () => {
  const s = summary(render({ ...PEANUT, severity: "mild", treat_traces_as_unsafe: false }, true));
  assert.match(s, /data-severity="mild"/);
  assert.match(s, /traces: caution/);
});

test("a follower's row has nothing to open, no controls and no notes", () => {
  const html = render(PEANUT, false);
  assert.doesNotMatch(html, /<details|<select|<input|<textarea|<button/);
  assert.match(html, /data-severity="severe"/);
  assert.match(html, /traces: unsafe/);
  assert.doesNotMatch(html, /EpiPen/, "the page has never shown allergen notes to followers");
});
