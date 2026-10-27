import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The time-boxed visual pass (2026-10-26, BACKLOG "Plan to judging" item 4): cards instead of bullet
// lists, neutral colours only — the verdict colours stay on verdicts.

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const CSS = src("./styles.css");

function rule(selector: string): string {
  const i = CSS.indexOf(`${selector} {`);
  assert.ok(i >= 0, `found ${selector}`);
  return CSS.slice(i, CSS.indexOf("}", i));
}

test("cards use the neutral border and no verdict colour", () => {
  for (const sel of [".card-list", "a.card", ".card__title", ".card__meta"]) {
    assert.doesNotMatch(rule(sel), /--color-(safe|caution|contains|unknown)/, sel);
  }
});

test("Profile tab: each managed and followed profile is one card, one link", () => {
  const page = src("./routes/Profiles.tsx");
  assert.equal(page.match(/<ul className="card-list">/g)?.length, 2);
  assert.equal(page.match(/<Link to=\{`\/profiles\/\$\{p\.id\}`\} className="card">/g)?.length, 2);
});
