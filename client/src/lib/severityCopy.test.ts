import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SeverityChoice } from "../SeverityChoice";
import * as severityCopy from "./severityCopy";
import { SEVERITY_CHOICES } from "./severityCopy";

// No default in either direction (docs/principles.md, 2026-10-25): a parent picks the severity.

test("one line per level, in order: Mild, Moderate, Severe", () => {
  assert.deepEqual(
    SEVERITY_CHOICES.map((c) => c.value),
    ["mild", "moderate", "severe"],
  );
  for (const c of SEVERITY_CHOICES) assert.ok(c.line.length > 0, `${c.value} has a line`);
});

test("the lines say what severe-only followers see — and that their scans check everything", () => {
  const [mild, moderate, severe] = SEVERITY_CHOICES;
  for (const c of [mild!, moderate!]) {
    assert.match(c.line, /'severe only'/);
    assert.match(c.line, /their scans still check it/);
  }
  assert.match(severe!.line, /including 'severe only'/);
});

test("there is no default severity to fall back on", () => {
  assert.deepEqual(Object.keys(severityCopy).sort(), ["SEVERITY_CHOICES", "SEVERITY_REQUIRED"]);
  const html = renderToStaticMarkup(createElement(SeverityChoice, { name: "s", value: null, onChange: () => {}, required: true }));
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /checked/, "nothing is chosen until someone chooses");
  assert.equal((html.match(/required=""/g) ?? []).length, 3);
});

test("neither form starts an allergen with a severity", () => {
  // The add-profile form's rows start from lib/allergenDrafts.ts (2026-10-26).
  const profiles = readFileSync(new URL("../routes/Profiles.tsx", import.meta.url), "utf8");
  const drafts = readFileSync(new URL("./allergenDrafts.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../routes/ProfileDetail.tsx", import.meta.url), "utf8");
  assert.match(drafts, /return \{ id: nextId\+\+, pick: EMPTY_PICK, severity: null, treatTracesAsUnsafe: true \};/);
  assert.match(profiles, /useState<AllergenDraft\[\]>\(\[emptyDraft\(\)\]\)/);
  assert.match(detail, /useState<Severity \| null>\(null\)/);
  for (const src of [profiles, drafts, detail]) {
    assert.doesNotMatch(src, /severity: "(mild|moderate|severe)"|useState<Severity>\("/);
  }
});
