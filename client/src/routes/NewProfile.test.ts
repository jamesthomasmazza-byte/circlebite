import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The guided profile setup's page (2026-10-27): what its source guarantees.

const PAGE = readFileSync(new URL("./NewProfile.tsx", import.meta.url), "utf8");
const MAIN = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("nothing is saved before the review: createProfile is called once, from Save", () => {
  assert.equal(PAGE.match(/createProfile\(/g)?.length, 1);
  const save = PAGE.slice(PAGE.indexOf("async function onSave()"), PAGE.indexOf("\n  }\n", PAGE.indexOf("async function onSave()")));
  assert.match(save, /const input = toCreateInput\(answers\);\s*if \(!input\) return;/);
  assert.match(save, /await createProfile\(input\)/);
});

test("every question takes focus when it appears", () => {
  const headings = PAGE.match(/<h1 className="guided__question" tabIndex=\{-1\} ref=\{headingRef\}>/g)?.length;
  assert.equal(headings, 7, "who, name, allergens, severity, may contain, review, finish");
  assert.match(PAGE, /useEffect\(\(\) => \{\s*headingRef\.current\?\.focus\(\);\s*\}, \[pos, savedId\]\);/);
});

test("chips are toggle buttons; who and severity are radio groups, none chosen until tapped", () => {
  assert.match(PAGE, /className="guided__chip"\s*aria-pressed=\{on\}/);
  assert.equal(PAGE.match(/role="radiogroup"/g)?.length, 2);
  assert.match(PAGE, /aria-checked=\{answers\.who === c\.value\}/);
  assert.match(PAGE, /const on = answers\.severity\[pos\.id\] === c\.value;/);
});

test("Continue waits for an answer; the classic form is a link away on every step", () => {
  assert.match(PAGE, /disabled=\{!ready\}/);
  assert.match(PAGE, /<Link className="guided__classic" to=\{ADD_PROFILE_PATH\}>/);
});

test("no guest mode: the route is inside RequireAuth, like every signed-in page", () => {
  const auth = MAIN.indexOf("<Route element={<RequireAuth />}>");
  const route = MAIN.indexOf('<Route path="/profiles/new" element={<NewProfile />} />');
  assert.ok(auth >= 0 && route > auth, "nested under RequireAuth");
  assert.ok(route < MAIN.indexOf('<Route path="/profiles/:id"'), "before /profiles/:id");
});

test("off, it sends you to the classic form", () => {
  assert.match(PAGE, /if \(!guidedSetupEnabled\) return <Navigate to=\{ADD_PROFILE_PATH\} replace \/>;/);
});

test("its styles use tokens only, and move only when motion is welcome", () => {
  const block = CSS.slice(CSS.indexOf("/* ---------- The guided profile setup"), CSS.indexOf("/* The guided setup's sample scan"));
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgb\(/i, "no colour that isn't a token");
  assert.doesNotMatch(block, /--color-(contains|alert|caution|safe)/, "no verdict colours");
  assert.match(block, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.guided__step \{\s*animation/);
});
