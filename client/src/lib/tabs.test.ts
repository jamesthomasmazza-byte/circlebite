import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { safeReturnTo } from "./returnTo";
import { activeTab, badgeLabel, keptChoice, LANDING_PATH, noticesShownOn, profileBadgeCount, requestedProfile, scanningForId, showScanForButton, tabsShown } from "./tabs";

const MAIN = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("../TabShell.tsx", import.meta.url), "utf8");

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
  for (const path of ["/scan", "/profiles", "/profiles/:id", "/profiles/:id/history", "/circle", "/snacks", "/settings", "/admin/ai-accuracy", "/admin/review-queue", "/admin/nps"]) {
    assert.ok(inside.includes(`path="${path}"`), `${path} is inside TabShell`);
  }
  assert.ok(noticesShownOn(LANDING_PATH), "the banner shows on the landing page itself");
});

test("every route maps to the tab it belongs to", () => {
  const expected: Record<string, string> = {
    "/scan": "scan",
    "/circle": "circle",
    "/snacks": "snacks",
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

// Snack lists (docs/snack-list-plan.md decision 7, 2026-11-13): a fourth tab after Circle, and only
// while the switch is on — off must be exactly today's three tabs.
test("Snacks is the fourth tab after Circle with SNACK_LIST on, and the bar is the three tabs without it", () => {
  assert.deepEqual(tabsShown(true), ["profile", "scan", "circle", "snacks"]);
  assert.deepEqual(tabsShown(false), ["profile", "scan", "circle"]);
  assert.match(SHELL, /\{tabsShown\(snackListEnabled\)\.map\(\(tab\) => \(/);
  assert.doesNotMatch(SHELL, /\["profile", "scan", "circle"\] as Tab\[\]/, "no second copy of the list");
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

// JT, 2026-11-05: the button shows only when Scan's "Scanning for" offers more than one profile —
// the shell's own managed + followed list, the one the dropdown uses.
test("'Scan for' shows only with two or more profiles to scan for", () => {
  assert.equal(showScanForButton(0), false);
  assert.equal(showScanForButton(1), false);
  assert.equal(showScanForButton(2), true);
  assert.match(PROFILE_DETAIL, /\{showScanForButton\(scannableCount\) && \(\s*<p>\s*<Link to=\{`\/scan\?profile=/);
  assert.match(SHELL, /scannableCount: profiles\.length,/);
  assert.match(SHELL, /const all = profiles\.status === "fulfilled" \? \[\.\.\.managed, \.\.\.profiles\.value\.followed\] : \[\];\s*setProfiles\(all\);/);
});

// After leaving a circle (2026-11-06): the shell reads the list again at once, and drops a choice
// that's no longer yours, so Scan and the header move to another profile, or to none.
test("a choice no longer in the list is dropped; one still there is kept", () => {
  const list = [{ id: "leo" }, { id: "noor" }];
  assert.equal(keptChoice("maya", list), null, "left Maya's circle");
  assert.equal(keptChoice("noor", list), "noor");
  assert.equal(keptChoice(null, list), null);
  assert.equal(keptChoice("maya", []), null, "no profiles left");
  // Then Scan and the header fall back: another profile, or none at all.
  assert.equal(scanningForId(keptChoice("maya", list), list), "leo");
  assert.equal(scanningForId(keptChoice("maya", []), []), "");
});

test("leaving a circle re-reads the shell's profiles right away, not on the next navigation", () => {
  const shell = readFileSync(new URL("../TabShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /\}, \[pathname, profilesRead\]\);/);
  assert.match(shell, /refreshProfiles: \(\) => setProfilesRead\(\(n\) => n \+ 1\),/);
  // In a block since 2026-11-13: the same read also marks the list as loaded, for the Snacks tab.
  assert.match(shell, /if \(profiles\.status === "fulfilled"\) \{\s*setProfilesLoaded\(true\);\s*setChosenProfileId\(\(chosen\) => keptChoice\(chosen, all\)\);\s*\}/);
  const circle = readFileSync(new URL("../routes/CircleRedesign.tsx", import.meta.url), "utf8");
  assert.match(circle, /onLeft=\{\(\) => \{\s*setProfilesRead\(\(n\) => n \+ 1\);\s*refreshProfiles\(\);\s*\}\}/);
});
