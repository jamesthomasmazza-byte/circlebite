import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as copy from "./emptyStateCopy";

// Every empty list names its next step (2026-10-26), and the bare "None." / "None yet." are gone.

const page = (name: string) => readFileSync(new URL(`../routes/${name}`, import.meta.url), "utf8");
const circleManage = readFileSync(new URL("../CircleManage.tsx", import.meta.url), "utf8");

test("the words", () => {
  assert.equal(copy.CIRCLE_JUST_YOU, "Just you, so far. Invite someone to follow or co-manage:");
  assert.match(copy.NO_FOLLOWED_PROFILES, /open it to follow their profile\.$/);
});

test("each empty state with somewhere to go links there", () => {
  assert.match(
    page("Profiles.tsx"),
    /\{NO_MANAGED_PROFILES\}[\s\S]{0,200}<Link to=\{guidedSetupEnabled \? NEW_PROFILE_PATH : ADD_PROFILE_PATH\}>\s*\{guidedSetupEnabled \? CREATE_ONE : CREATE_ONE_BELOW\}/,
  );
  assert.match(page("Profiles.tsx"), /<section id="add-profile" ref=\{addSectionRef\}>/);
  assert.match(page("ScanHistory.tsx"), /\{NO_SCANS\} <Link to=\{id \? `\/scan\?profile=\$\{id\}` : "\/scan"\}>\{SCAN_A_PRODUCT\}<\/Link>/);
  // The Circle card's next step is the invite form under it, in the same card (since 2026-11-05).
  assert.match(circleManage, /<p>\{CIRCLE_JUST_YOU\}<\/p>[\s\S]*<h3>\{INVITE_SOMEONE\}<\/h3>[\s\S]*<form onSubmit=\{handleFollowInvite\}/);
});

test("no bare 'None' left on these pages", () => {
  for (const name of ["Circle.tsx", "Profiles.tsx", "ProfileDetail.tsx", "ScanHistory.tsx"]) {
    assert.doesNotMatch(page(name), /<p>(None\.|None yet\.|Just you, so far\.|No scans yet\.)<\/p>/, name);
  }
  assert.doesNotMatch(circleManage, /<p>(None\.|None yet\.|Just you, so far\.)<\/p>/);
});
