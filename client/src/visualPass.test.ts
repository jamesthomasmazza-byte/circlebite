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

test("profile page: allergens are cards, and Remove has its own line", () => {
  const page = src("./routes/ProfileDetail.tsx");
  assert.match(page, /<ul className="card-list">\s*\{profile\.allergens\.map/);
  // Each allergen's card is its own component since 2026-11-05 (AllergenItem.tsx).
  assert.match(page, /<AllergenItem\s+key=\{a\.id\}/);
  assert.match(src("./AllergenItem.tsx"), /<li className="card allergen-item">/);
  // The people moved to the Circle tab on 2026-11-05 (CircleManage.tsx, the next test).
  assert.match(src("./AllergenItem.tsx"), /<p className="card__actions">[\s\S]*?\{REMOVE\}[\s\S]*?<\/p>/);
});

test("Circle tab: members and invites are rows inside the card; circles you're in are card links", () => {
  const page = src("./routes/Circle.tsx");
  assert.match(src("./CircleManage.tsx"), /<ul className="row-list circle-members">/);
  assert.match(src("./PendingInvites.tsx"), /<ul className="pending-invites row-list">/);
  assert.match(page, /<Link to=\{`\/profiles\/\$\{p\.id\}`\} className="card">/);
  assert.doesNotMatch(rule(".row-list > li + li"), /--color-(safe|caution|contains|unknown)/);
});

test("scan history: one card per scan, the date on its own line, the verdict label unchanged", () => {
  // Since 2026-10-28 each card is a summary, its reasoning in a disclosure (routes/ScanHistory.test.ts).
  const page = src("./routes/ScanHistory.tsx");
  assert.match(page, /<ul className="card-list">\s*\{scans\.map/);
  // With an id since 2026-11-06, for Scan's Recent cards (SCAN_REDESIGN).
  assert.match(page, /<li id=\{`scan-\$\{scan\.id\}`\} className="card history-entry">/);
  assert.match(page, /data-verdict=\{shown\.result\}>\s*\{VERDICT_LABEL\[shown\.result\]\}\s*<\/strong>/);
  assert.match(page, /<time className="card__meta card__line" dateTime=\{scan\.created_at\}>\s*\{shortDateTime\(scan\.created_at\)\}\s*<\/time>/);
});
