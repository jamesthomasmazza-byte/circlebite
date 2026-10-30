import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { safeReturnTo } from "./returnTo";
import { activeTab, badgeLabel, LANDING_PATH, noticesShownOn, profileBadgeCount, requestedProfile, scanningForId } from "./tabs";

const MAIN = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("sign-in lands on Scan: the default return path, and where /dashboard redirects", () => {
  assert.equal(LANDING_PATH, "/scan");
  assert.equal(safeReturnTo(null), "/scan");
  assert.equal(safeReturnTo("/profiles/abc"), "/profiles/abc");
  assert.equal(safeReturnTo("//evil.example"), "/scan");
  assert.equal(safeReturnTo("https://evil.example"), "/scan");
  assert.match(MAIN, /path="\/dashboard" element={<Navigate to={LANDING_PATH} replace \/>}/);
  // "/" is Home: Scan when signed in, the landing page when not (routes/Home.test.ts).
  assert.match(MAIN, /path="\/" element={<Home \/>} \/>/);
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

// The header and Scan share one choice (TabShell.tsx). A profile page's "Scan for" button arrives as
// /scan?profile=<id>; that's the profile both then use.
const PROFILE_DETAIL = readFileSync(new URL("../routes/ProfileDetail.tsx", import.meta.url), "utf8");
const SCAN = readFileSync(new URL("../routes/Scan.tsx", import.meta.url), "utf8");

test("a profile page's 'Scan for' button selects that profile for Scan and the header", () => {
  assert.match(PROFILE_DETAIL, /<Link to=\{`\/scan\?profile=\$\{id\}`\} className="button-link">\s*Scan for \{profile\.label\}/);
  const profiles = [{ id: "maya" }, { id: "leo" }];
  assert.equal(requestedProfile("?profile=leo"), "leo");
  assert.equal(scanningForId(requestedProfile("?profile=leo"), profiles), "leo");
});

test("the profile scanned for: the last one chosen while it's still readable, else the first", () => {
  const profiles = [{ id: "maya" }, { id: "leo" }];
  assert.equal(scanningForId(null, profiles), "maya");
  assert.equal(scanningForId("leo", profiles), "leo");
  // A follow revoked, or a made-up id: never a profile you can't read.
  assert.equal(scanningForId("someone-else", profiles), "maya");
  assert.equal(scanningForId("leo", []), "");
  assert.equal(requestedProfile(""), null);
});

test("Scan takes the profile from the shell, not a choice of its own the header can't see", () => {
  assert.match(SCAN, /useScanningFor\(\)/);
  assert.match(SCAN, /const profileId = scanningForId\(chosenProfileId, profiles\)/);
  assert.doesNotMatch(SCAN, /useState\(searchParams\.get\("profile"\)/);
});
