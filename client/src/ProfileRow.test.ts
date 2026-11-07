import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import type { ProfileSummary } from "./lib/api";
import { ProfileRow } from "./ProfileRow";

// The redesigned Profile tab's rows (JT, 2026-11-06, behind PROFILE_REDESIGN).

const render = (profile: ProfileSummary, followed: boolean, unseen = 0) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProfileRow, { profile, followed, unseen })));
const MAYA: ProfileSummary = { id: "m", label: "Maya Lee", is_self: false, relationship: "owner", allergen_names: ["Peanut", "Sesame"] };

test("a managed row: initials (never a photo), the name, the allergen line, how you hold it", () => {
  const html = render(MAYA, false);
  assert.match(html, /profile-row__avatar" aria-hidden="true">ML</);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /profile-row__name">Maya Lee</);
  assert.match(html, /<span class="profile-line">Peanut, Sesame<\/span>/);
  assert.match(html, /profile-row__tag">You own</);
  assert.match(render({ ...MAYA, relationship: "co_manager" }, false), /profile-row__tag">Co-manager</);
});

test("the red count shows only with unacknowledged changes, and is read out", () => {
  assert.doesNotMatch(render(MAYA, false), /profile-row__badge/);
  const html = render(MAYA, false, 2);
  assert.match(html, /<span class="profile-row__badge">2<\/span>/);
  assert.match(html, /, 2 updates to review/);
});

test("a followed row: a severe-only follow shows the severe names and says so, never \"no allergens\"", () => {
  const severe: ProfileSummary = { id: "n", label: "Noor", is_self: false, share_level: "severe_only", allergen_names: ["Tree nut"] };
  assert.match(render(severe, true), /Tree nut<\/span>[\s\S]*profile-row__tag">Severe allergens only</);
  const empty = render({ ...severe, allergen_names: [] }, true);
  assert.match(empty, /Only severe allergens are shared with you/);
  assert.doesNotMatch(empty, /No allergens/);
  assert.doesNotMatch(render({ ...severe, share_level: "all" }, true), /profile-row__tag/);
});

test("switch off: today's Profile tab, with its bottom Account & settings link; on, the header's menu icon", () => {
  const page = readFileSync(new URL("./routes/Profiles.tsx", import.meta.url), "utf8");
  assert.match(page, /const redesign = profileRedesignEnabled;/);
  assert.match(page, /\{!redesign && \(\s*<p>\s*<Link to=\{ACCOUNT_PATH\}>Account &amp; settings<\/Link>/);
  assert.match(page, /redesign \? \(\s*<ProfileRow key=\{p\.id\} profile=\{p\} followed=\{false\}/);
  const shell = readFileSync(new URL("./TabShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /accountMenu=\{profileRedesignEnabled && pathname === TAB_PATH\.profile\}/);
  assert.match(shell, /<Link to="\/settings" className="shell-header__menu" aria-label=\{ACCOUNT_AND_SETTINGS\}>/);
  // Condition 2's full notices stay first on the Profile tab: the shell decides by the path alone.
  assert.match(shell, /<LandingNotices \{\.\.\.notices\} slim=\{current === "scan"\} \/>/);
});
