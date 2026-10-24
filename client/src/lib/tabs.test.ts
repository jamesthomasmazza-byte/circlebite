import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { safeReturnTo } from "./returnTo";
import { activeTab, badgeLabel, LANDING_PATH, noticesShownOn, profileBadgeCount } from "./tabs";

const MAIN = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("sign-in lands on Scan: the default return path, and where / and /dashboard redirect", () => {
  assert.equal(LANDING_PATH, "/scan");
  assert.equal(safeReturnTo(null), "/scan");
  assert.equal(safeReturnTo("/profiles/abc"), "/profiles/abc");
  assert.equal(safeReturnTo("//evil.example"), "/scan");
  assert.equal(safeReturnTo("https://evil.example"), "/scan");
  assert.match(MAIN, /path="\/dashboard" element={<Navigate to={LANDING_PATH} replace \/>}/);
  assert.match(MAIN, /path="\/" element={<Navigate to={LANDING_PATH} replace \/>}/);
  assert.doesNotMatch(MAIN, /<Dashboard/, "the dashboard page is gone");
});

// The layout that shows Condition 2's banner (TabShell.tsx) has to wrap the landing page. If Scan
// were ever moved out of it, an owner would land on a screen with no word of a co-manager's change.
test("Scan, and every signed-in page, sits inside the tab bar's layout", () => {
  const open = MAIN.indexOf("<Route element={<TabShell />}>");
  const close = MAIN.indexOf("</Route>", open);
  assert.ok(open > 0 && close > open);
  const inside = MAIN.slice(open, close);
  for (const path of ["/scan", "/profiles", "/profiles/:id", "/profiles/:id/history", "/circle", "/settings", "/admin/ai-accuracy", "/admin/review-queue", "/admin/nps"]) {
    assert.ok(inside.includes(`path="${path}"`), `${path} is inside TabShell`);
  }
  assert.ok(noticesShownOn(LANDING_PATH), "the banner shows on the landing page itself");
});

test("every route maps to the tab it belongs to", () => {
  const expected: Record<string, string> = {
    "/scan": "scan",
    "/circle": "circle",
    "/profiles": "profile",
    "/profiles/abc": "profile",
    "/profiles/abc/history": "profile",
    "/settings": "profile",
    "/admin/ai-accuracy": "profile",
    "/admin/review-queue": "profile",
    "/admin/nps": "profile",
  };
  for (const [path, tab] of Object.entries(expected)) assert.equal(activeTab(path), tab, path);
});

test("the notices show in full on Scan and the Profile tab's page, and nowhere else", () => {
  assert.equal(noticesShownOn("/scan"), true);
  assert.equal(noticesShownOn("/profiles"), true);
  for (const path of ["/circle", "/profiles/abc", "/settings"]) assert.equal(noticesShownOn(path), false, path);
});

test("the Profile badge counts unseen changes and allergens needing a look", () => {
  assert.equal(profileBadgeCount([{ count: 3 }], [{ allergens_needing_review: 1 }, {}]), 4);
  assert.equal(profileBadgeCount([], []), 0);
  assert.equal(badgeLabel(1), "1 update to review");
  assert.equal(badgeLabel(4), "4 updates to review");
});
