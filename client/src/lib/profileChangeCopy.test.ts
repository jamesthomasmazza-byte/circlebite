import assert from "node:assert/strict";
import { test } from "node:test";

import type { AllergenImage, ProfileHistoryEntry, UnseenProfileChanges } from "./api";
import { describeChange, entryActor, joinNames, unseenActors, unseenBannerLine } from "./profileChangeCopy";

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

// ---- describeChange: one entry per kind ----

const MAYA = { label: "Maya", isSelf: false };
const PEANUT: AllergenImage = { name: "Peanut", severity: "severe", notes: "carries EpiPen", treat_traces_as_unsafe: true };

function entry(overrides: Partial<ProfileHistoryEntry>): ProfileHistoryEntry {
  return {
    id: "c1",
    kind: "allergen_edited",
    createdAt: "2026-10-06T21:14:00Z",
    actorName: "Sam",
    actorRole: "co_manager",
    actorKnown: true,
    actorIsViewer: false,
    before: null,
    after: null,
    downgrade: null,
    unseen: true,
    ...overrides,
  };
}

function downgrade(overrides: Partial<NonNullable<ProfileHistoryEntry["downgrade"]>>, entryOverrides: Partial<ProfileHistoryEntry> = {}) {
  return entry({
    kind: "downgrade_reported",
    downgrade: {
      correctionType: "flag_wrong",
      allergen: "Peanut",
      productName: "Crunch Bars",
      productBrand: "Acme",
      verdictAtReport: "contains_allergen",
      note: "made in a nut-free facility",
      hasPhoto: true,
      scannedAt: "2026-10-03T12:00:00Z",
      currentStatus: "pending",
      ...overrides,
    },
    ...entryOverrides,
  });
}

test("describeChange: a removal shows the whole allergen as it was, and that scans stop checking for it", () => {
  const d = describeChange(entry({ kind: "allergen_removed", before: PEANUT }), MAYA);
  assert.equal(d.headline, "Sam (co-manager) removed Peanut");
  assert.deepEqual(d.details, ["It was: severe; “may contain” treated as unsafe; note: “carries EpiPen”."]);
  assert.deepEqual(d.consequences, ["Scans for Maya no longer check for Peanut."]);
});

test("describeChange: a rename asks the parent to check, naming what scans stop warning about", () => {
  const d = describeChange(entry({ before: PEANUT, after: { ...PEANUT, name: "Pnut" } }), MAYA);
  assert.equal(d.headline, "Sam (co-manager) changed Peanut");
  assert.deepEqual(d.details, ["Renamed “Peanut” to “Pnut”."]);
  assert.ok(d.check, "a rename must carry a check, not just a detail");
  assert.match(d.check!, /^Check that “Pnut” is still the allergen you mean\./);
  assert.match(d.check!, /scans for Maya will stop warning about Peanut/);
});

test("describeChange: traces off says a “may contain” label is now only a caution", () => {
  const d = describeChange(entry({ before: PEANUT, after: { ...PEANUT, treat_traces_as_unsafe: false } }), MAYA);
  assert.deepEqual(d.consequences, ["A “may contain Peanut” label now shows as a caution, not “contains”."]);
  assert.equal(d.check, null);
});

test("describeChange: severity down from severe says severe-only followers stop seeing it", () => {
  const d = describeChange(entry({ before: PEANUT, after: { ...PEANUT, severity: "mild" } }), MAYA);
  assert.deepEqual(d.details, ["Severity: severe → mild."]);
  assert.deepEqual(d.consequences, ["People who follow Maya for severe allergens only no longer see Peanut."]);
});

test("describeChange: several edits at once each get their own line", () => {
  const d = describeChange(
    entry({ before: PEANUT, after: { name: "Pnut", severity: "moderate", notes: null, treat_traces_as_unsafe: false } }),
    MAYA,
  );
  assert.equal(d.details.length, 4);
  assert.equal(d.consequences.length, 2);
  assert.ok(d.check);
});

test("describeChange: a downgrade keeps its closing sentence — only that person's view of that scan changed", () => {
  const d = describeChange(downgrade({}), MAYA);
  assert.equal(d.headline, "Sam (co-manager) reported Peanut isn't in Crunch Bars (Acme)");
  assert.deepEqual(d.consequences, [
    "This changed only what Sam sees for that one scan. Sam's card no longer warns about Peanut. " +
      "Maya's profile, and what you and everyone else see, are unchanged.",
  ]);
  assert.ok(d.details.includes("The card had said: Contains an allergen."));
  assert.equal(d.status, null);
});

test("describeChange: a downgrade later rejected in review says so, and stops claiming it changes anything", () => {
  const d = describeChange(downgrade({ currentStatus: "rejected" }), MAYA);
  assert.equal(d.status, "Reviewed and not accepted. Sam's card shows the warning again.");
  assert.deepEqual(d.consequences, [
    "This had changed only what Sam saw for that one scan. Maya's profile, and what you and everyone else saw, were never changed.",
  ]);
  assert.ok(!d.consequences.join(" ").includes("no longer warns"));
});

test("describeChange: a wrong-product report says the card shows Unable to confirm instead", () => {
  const d = describeChange(downgrade({ correctionType: "wrong_product", allergen: null }), MAYA);
  assert.equal(d.headline, "Sam (co-manager) reported that a scan of Crunch Bars (Acme) matched the wrong product");
  assert.match(d.consequences[0]!, /Sam's card for it now shows “Unable to confirm” instead of its warnings\./);
  assert.match(d.consequences[0]!, /are unchanged\.$/);
});

test("describeChange: an unrecorded report type is described without guessing which kind it was", () => {
  const d = describeChange(downgrade({ correctionType: null }), MAYA);
  assert.equal(d.headline, "Sam (co-manager) reported a problem with the verdict on a scan of Crunch Bars (Acme)");
  assert.doesNotMatch(d.consequences[0]!, /no longer warns|Unable to confirm/);
  assert.match(d.consequences[0]!, /^This changed only what Sam sees for that one scan\./);
});

test("describeChange: your own downgrade reads in the second person", () => {
  const d = describeChange(downgrade({}, { actorIsViewer: true, actorRole: "owner" }), MAYA);
  assert.equal(d.headline, "You reported Peanut isn't in Crunch Bars (Acme)");
  assert.match(d.consequences[0]!, /^This changed only what you see for that one scan\. Your card no longer warns about Peanut\./);
  assert.match(d.consequences[0]!, /Maya's profile and what everyone else sees are unchanged\.$/);
});

test("describeChange: a profile note being cleared is shown before and after", () => {
  const d = describeChange(
    entry({
      kind: "profile_edited",
      before: { label: "Maya", notes: "carries EpiPen", default_treat_traces_as_unsafe: true },
      after: { label: "Maya", notes: null, default_treat_traces_as_unsafe: true },
    }),
    MAYA,
  );
  assert.equal(d.headline, "Sam (co-manager) changed Maya's profile");
  assert.deepEqual(d.details, ["Profile note: “carries EpiPen” → (none)."]);
});

test("entryActor: no recorded actor is 'Someone outside the app', never a guess", () => {
  assert.equal(entryActor({ actorIsViewer: false, actorKnown: false, actorName: null, actorRole: null }), "Someone outside the app");
  assert.equal(
    entryActor({ actorIsViewer: false, actorKnown: true, actorName: null, actorRole: "co_manager" }),
    "Someone whose name wasn't recorded (co-manager)",
  );
});
