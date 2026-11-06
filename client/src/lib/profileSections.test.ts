import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ACCOUNT_PATH, ADD_PROFILE_PATH, addFormRequested, addProfileHref, NEW_PROFILE_PATH, oldSectionRedirect } from "./profileSections";
import { noticesShownOn } from "./tabs";

// The Profile tab lists people only since 2026-11-06 (JT); its old Account and Admin sections are on
// the Account page (routes/Settings.tsx, routes/Settings.test.ts).

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const PROFILES = src("../routes/Profiles.tsx");

test("the old #account and #admin go on to the Account page; anything else stays", () => {
  assert.equal(ACCOUNT_PATH, "/settings");
  assert.equal(oldSectionRedirect("#account"), ACCOUNT_PATH);
  assert.equal(oldSectionRedirect("#admin"), ACCOUNT_PATH, "a non-admin there sees the page without Admin");
  for (const hash of ["", "#add-profile", "#nonsense"]) assert.equal(oldSectionRedirect(hash), null, hash);
  assert.match(PROFILES, /const to = oldSectionRedirect\(hash\);\s*if \(to\) navigate\(to, \{ replace: true \}\);/);
});

test("the Profile tab lists people only, ending with one link to the Account page", () => {
  assert.doesNotMatch(PROFILES, /section-switcher|Signed in as|Log out|logout|\/admin\/|saveOverride|ScanSoundsSetting/);
  const followed = PROFILES.indexOf("<h2>Profiles you follow</h2>");
  const link = PROFILES.indexOf("<Link to={ACCOUNT_PATH}>Account &amp; settings</Link>");
  assert.ok(followed > 0 && link > followed, "after the profiles you follow");
  assert.doesNotMatch(PROFILES.slice(link), /<section|<Link to=\{`/, "and last on the page");
});

test("/profiles keeps Condition 2's notices and badge", () => {
  assert.ok(noticesShownOn("/profiles"));
  assert.ok(noticesShownOn(new URL(ADD_PROFILE_PATH, "https://x").pathname));
  // TabShell decides from the path alone, never the fragment.
  assert.match(src("../TabShell.tsx"), /noticesShownOn\(pathname\)/);
});

test("'Create one' links land on the classic form, or the guided setup when GUIDED_SETUP is on", () => {
  assert.equal(addProfileHref(false), ADD_PROFILE_PATH);
  assert.equal(addProfileHref(true), NEW_PROFILE_PATH);
  assert.equal(NEW_PROFILE_PATH, "/profiles/new");
  assert.equal(ADD_PROFILE_PATH, "/profiles#add-profile");
  assert.ok(addFormRequested("#add-profile"));
  assert.ok(!addFormRequested(""));
  assert.match(PROFILES, /useState\(\(\) => addFormRequested\(hash\)\)/);
  for (const page of ["../routes/Scan.tsx", "../routes/Circle.tsx"]) {
    assert.match(src(page), /<Link to=\{addProfileHref\(guidedSetupEnabled\)\}>/, page);
  }
  // Folded behind a button otherwise.
  assert.match(PROFILES, /\{!addOpen \? \(\s*<button type="button" onClick=\{\(\) => \(guidedSetupEnabled \? navigate\(NEW_PROFILE_PATH\) : setAddOpen\(true\)\)\}>\s*Add a profile/);
});

test("'Add a profile' sits directly under the profiles you manage, above the ones you follow", () => {
  const managed = PROFILES.indexOf("<h2>Profiles you manage</h2>");
  const add = PROFILES.indexOf('<section id="add-profile" ref={addSectionRef}>');
  const followed = PROFILES.indexOf("<h2>Profiles you follow</h2>");
  assert.ok(managed < add && add < followed);
  // Outside any condition on the managed list, so it shows when there are none.
  const between = PROFILES.slice(PROFILES.indexOf("</section>", managed), add);
  assert.doesNotMatch(between, /managed\.length/);
});
