import assert from "node:assert/strict";
import { test } from "node:test";

import type { UnseenProfileChanges } from "./api";
import { joinNames, unseenActors, unseenBannerLine } from "./profileChangeCopy";

function unseen(overrides: Partial<UnseenProfileChanges>): UnseenProfileChanges {
  return {
    profileId: "p1",
    label: "Maya",
    isSelf: false,
    count: 1,
    actorNames: ["Sam"],
    outsideApp: false,
    unnamedActor: false,
    hasDowngrade: false,
    hasProfileChange: true,
    ...overrides,
  };
}

test("unseenBannerLine: a profile change says the profile changed", () => {
  assert.equal(unseenBannerLine(unseen({})), "Sam changed Maya's profile — 1 update you haven't reviewed.");
});

test("unseenBannerLine: a downgrade alone never claims the profile changed", () => {
  // It changed only the reporter's view of one scan (corrections/userScanView.ts).
  const line = unseenBannerLine(unseen({ hasDowngrade: true, hasProfileChange: false }));
  assert.equal(line, "Sam disputed a warning on a scan for Maya — 1 update you haven't reviewed.");
  assert.doesNotMatch(line, /changed/);
});

test("unseenBannerLine: both kinds are named separately, with the count pluralized", () => {
  assert.equal(
    unseenBannerLine(unseen({ count: 3, hasDowngrade: true, actorNames: ["Lee", "Sam"] })),
    "Lee and Sam changed Maya's profile and disputed a scan warning — 3 updates you haven't reviewed.",
  );
});

test("unseenBannerLine: a downgrade alone on the owner's own profile reads 'for you'", () => {
  assert.equal(
    unseenBannerLine(unseen({ label: "Me", isSelf: true, hasDowngrade: true, hasProfileChange: false })),
    "Sam disputed a warning on a scan for you — 1 update you haven't reviewed.",
  );
});

test("unseenBannerLine: the owner's own profile reads 'your', not its label", () => {
  assert.equal(
    unseenBannerLine(unseen({ label: "Me", isSelf: true, hasDowngrade: true })),
    "Sam changed your profile and disputed a scan warning — 1 update you haven't reviewed.",
  );
});

test("unseenActors: a change with no acting user is 'someone outside the app', never a guess", () => {
  assert.equal(unseenActors({ actorNames: [], outsideApp: true, unnamedActor: false }), "Someone outside the app");
  assert.equal(
    unseenActors({ actorNames: ["Sam"], outsideApp: true, unnamedActor: true }),
    "Sam, someone whose name wasn't recorded and someone outside the app",
  );
});

test("joinNames: one, two, three, and more than three", () => {
  assert.equal(joinNames(["Sam"]), "Sam");
  assert.equal(joinNames(["Sam", "Lee"]), "Sam and Lee");
  assert.equal(joinNames(["Sam", "Lee", "Kim"]), "Sam, Lee and Kim");
  assert.equal(joinNames(["Sam", "Lee", "Kim", "Ana"]), "Sam, Lee and 2 others");
});
