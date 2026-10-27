import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ADD_PROFILE_PATH, addFormRequested, profileSection, sectionHref, visibleSections } from "./profileSections";
import { noticesShownOn } from "./tabs";

// The Profile tab's sections (2026-10-26): picked by the fragment, so the path never changes.

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const PROFILES = src("../routes/Profiles.tsx");

test("the fragment picks the section; Admin only for an admin", () => {
  assert.equal(profileSection("", false), "profiles");
  assert.equal(profileSection("#account", false), "account");
  assert.equal(profileSection("#admin", true), "admin");
  assert.equal(profileSection("#admin", false), "profiles", "a non-admin typing #admin gets Profiles");
  assert.equal(profileSection("#add-profile", true), "profiles");
  assert.equal(profileSection("#nonsense", true), "profiles");
  assert.deepEqual(visibleSections(false), ["profiles", "account"]);
  assert.deepEqual(visibleSections(true), ["profiles", "account", "admin"]);
});

test("every section is /profiles, so Condition 2's notices and badge are on all three", () => {
  for (const s of visibleSections(true)) {
    const href = sectionHref(s);
    assert.ok(noticesShownOn(new URL(href, "https://x").pathname), href);
  }
  assert.ok(noticesShownOn(new URL(ADD_PROFILE_PATH, "https://x").pathname));
  // TabShell decides from the path alone, never the fragment.
  assert.match(src("../TabShell.tsx"), /noticesShownOn\(pathname\)/);
});

test("the Admin section and its link exist only for an admin", () => {
  assert.match(PROFILES, /visibleSections\(isAdmin\)\.map/);
  assert.match(PROFILES, /\{section === "admin" && \(/);
  assert.match(PROFILES, /const isAdmin = user\?\.isAdmin === true;/);
  assert.doesNotMatch(PROFILES, /AI accuracy[\s\S]*\{section === "admin"/, "no admin link outside the section");
});

test("'Create one' links land on Profiles with the add-profile form open", () => {
  assert.equal(ADD_PROFILE_PATH, "/profiles#add-profile");
  assert.ok(addFormRequested("#add-profile"));
  assert.ok(!addFormRequested(""));
  assert.match(PROFILES, /useState\(\(\) => addFormRequested\(hash\)\)/);
  for (const page of ["../routes/Scan.tsx", "../routes/Circle.tsx"]) {
    assert.match(src(page), /<Link to=\{ADD_PROFILE_PATH\}>/, page);
  }
  // Folded behind a button otherwise.
  assert.match(PROFILES, /\{!addOpen \? \(\s*<button type="button" onClick=\{\(\) => setAddOpen\(true\)\}>\s*Add a profile/);
});
