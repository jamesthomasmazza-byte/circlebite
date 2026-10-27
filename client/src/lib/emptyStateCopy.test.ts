import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as copy from "./emptyStateCopy";

// Every empty list names its next step (2026-10-26), and the bare "None." / "None yet." are gone.

const page = (name: string) => readFileSync(new URL(`../routes/${name}`, import.meta.url), "utf8");

test("the words", () => {
  assert.equal(copy.CIRCLE_JUST_YOU, "Just you, so far. Invite someone to follow or co-manage:");
  assert.equal(copy.PROFILE_CIRCLE_JUST_YOU, "Just you, so far. Invite someone with the forms above.");
  assert.equal(copy.NO_PENDING_INVITES, "No invites waiting.");
  assert.match(copy.NO_FOLLOWED_PROFILES, /open it to follow their profile\.$/);
});

test("each empty state with somewhere to go links there", () => {
  assert.match(page("Profiles.tsx"), /\{NO_MANAGED_PROFILES\} <Link to=\{ADD_PROFILE_PATH\}>\{CREATE_ONE_BELOW\}<\/Link>/);
  assert.match(page("Profiles.tsx"), /<section id="add-profile" ref=\{addSectionRef\}>/);
  assert.match(page("ScanHistory.tsx"), /\{NO_SCANS\} <Link to=\{id \? `\/scan\?profile=\$\{id\}` : "\/scan"\}>\{SCAN_A_PRODUCT\}<\/Link>/);
  // The Circle card's next step is the link the card already ends with.
  assert.match(page("Circle.tsx"), /<p>\{CIRCLE_JUST_YOU\}<\/p>[\s\S]*Invite people or manage \{whose\} circle/);
});

test("no bare 'None' left on these pages", () => {
  for (const name of ["Circle.tsx", "Profiles.tsx", "ProfileDetail.tsx", "ScanHistory.tsx"]) {
    assert.doesNotMatch(page(name), /<p>(None\.|None yet\.|Just you, so far\.|No scans yet\.)<\/p>/, name);
  }
});
