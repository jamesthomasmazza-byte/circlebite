import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allergensStat,
  inCircleStat,
  newBadge,
  profileTabs,
  roleLine,
  roleTag,
  scansStat,
  severeOnlyNotice,
  TAB_LABEL,
  tabFromHash,
  unseenCountFor,
} from "./profileRedesign";

// The redesigned Profile tab and profile page's rules (JT, 2026-11-06, behind PROFILE_REDESIGN).

const OWNER = { level: "owner" } as const;
const CO = { level: "co_manager" } as const;
const FULL = { level: "follower", shareLevel: "all" } as const;
const SEVERE = { level: "follower", shareLevel: "severe_only" } as const;

test("roles: a tag on each managed row, and a line under the avatar for every role", () => {
  assert.equal(roleTag("owner"), "You own");
  assert.equal(roleTag("co_manager"), "Co-manager");
  assert.equal(roleLine(OWNER), "You own this profile");
  assert.equal(roleLine(CO), "You co-manage this profile");
  assert.equal(roleLine(FULL), "You follow");
  assert.equal(roleLine(SEVERE), "You follow · severe allergens only");
});

test("stats read as counts", () => {
  assert.equal(allergensStat(1), "1 allergen");
  assert.equal(allergensStat(3), "3 allergens");
  assert.equal(inCircleStat(4), "4 in circle");
  assert.equal(scansStat(1), "1 scan");
  assert.equal(scansStat(23), "23 scans");
});

test("a follower never gets the Changes tab; the hash opens a tab only if the viewer has it", () => {
  assert.deepEqual(profileTabs(OWNER), ["allergens", "scans", "changes"]);
  assert.deepEqual(profileTabs(CO), ["allergens", "scans", "changes"]);
  assert.deepEqual(profileTabs(FULL), ["allergens", "scans"]);
  assert.deepEqual(profileTabs(SEVERE), ["allergens", "scans"]);
  assert.equal(tabFromHash("#changes", profileTabs(OWNER)), "changes", "Condition 2's links land on Changes");
  assert.equal(tabFromHash("#changes", profileTabs(FULL)), "allergens");
  assert.equal(tabFromHash("#scans", profileTabs(FULL)), "scans");
  assert.equal(tabFromHash("", profileTabs(OWNER)), "allergens");
  assert.equal(TAB_LABEL.scans, "Scans", "the history is every scan of the profile, not only the viewer's");
});

test("the severe-only notice: the profile page's sentence, then why their scans are still complete", () => {
  assert.equal(
    severeOnlyNotice(SEVERE, "Noor"),
    "Only severe allergens are shared with you. Your scans still check every allergen on Noor's profile.",
  );
  for (const access of [OWNER, CO, FULL]) assert.equal(severeOnlyNotice(access, "Noor"), null);
});

test("a profile row's red count is its unacknowledged changes, the tab badge's count", () => {
  const unseen = [{ profileId: "m", count: 2 }];
  assert.equal(unseenCountFor("m", unseen), 2);
  assert.equal(unseenCountFor("l", unseen), 0);
  assert.equal(newBadge(2), "2 new");
});
