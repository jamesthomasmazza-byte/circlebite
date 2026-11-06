import assert from "node:assert/strict";
import { test } from "node:test";

import type { CircleData } from "./api";
import {
  ADD_CHOICES,
  canActOnInvite,
  canRemove,
  followerRole,
  initialCircle,
  initials,
  inviteUrl,
  LINK_FOOTNOTE,
  members,
  PENDING_LINE,
  pendingInvites,
  pillLabel,
  removalLine,
  ROLE_LINE,
  shareMessage,
  whatTheyCanDo,
  whatYouCanSee,
  whoCanSee,
} from "./circleRedesign";

// The redesigned Circle tab's rules (JT, 2026-11-06, behind CIRCLE_REDESIGN). Each sentence is one
// the server makes true; the checks it rests on are in server routes/circle.test.ts.

const OWNER = "u-owner";
const CO = "u-co";
const MAYA = { id: "p1", label: "Maya", is_self: false };
const ME = { id: "p2", label: "Jordan", is_self: true };

const CIRCLE: CircleData = {
  owner: { user_id: OWNER, display_name: "Sam Rivera" },
  managers: [{ user_id: CO, added_at: "2026-10-02T12:00:00Z", display_name: "Alex Kim", email: "a@example.test" }],
  followers: [
    { id: "f1", share_level: "all", responded_at: "2026-10-05T12:00:00Z", display_name: "Grandma Lou", email: "g@example.test" },
    { id: "f2", share_level: "severe_only", responded_at: "2026-10-09T12:00:00Z", display_name: "Coach Pat", email: "c@example.test" },
  ],
  pendingManagerInvites: [{ id: "mi1", created_at: "2026-11-01T00:00:00Z", sent_by_id: OWNER, sent_by_name: "Sam Rivera" }],
  pendingFollows: [{ id: "fi1", share_level: "severe_only", message: null, created_at: "2026-11-02T00:00:00Z", sent_by_id: CO, sent_by_name: "Alex Kim" }],
};

test("pills: a managed profile by name, a followed one with \"· you're in\"", () => {
  assert.equal(pillLabel(MAYA, false), "Maya");
  assert.equal(pillLabel({ label: "Sam" }, true), "Sam · you're in");
});

test("initials: up to two letters, never a photo", () => {
  assert.equal(initials("Grandma Lou"), "GL");
  assert.equal(initials("Maya"), "M");
  assert.equal(initials("Mary Ann Smith"), "MS");
  assert.equal(initials("  "), "?");
});

test("every member has a plain-language role; the owner reads \"Owns the profile\"", () => {
  const rows = members(CIRCLE, CO);
  assert.deepEqual(rows.map((m) => [m.name, ROLE_LINE[m.role]]), [
    ["Sam Rivera", "Owns the profile"],
    ["You", "Can edit the profile"],
    ["Grandma Lou", "Sees all allergens"],
    ["Coach Pat", "Sees severe allergens only"],
  ]);
  assert.equal(rows[0]!.joined, null, "the owner made the profile; no join date");
  assert.equal(rows[2]!.joined, "2026-10-05T12:00:00Z", "a follower joined when they accepted");
  assert.equal(followerRole("severe_only"), "follower_severe");
});

test("Remove only where the viewer's role can: never the owner, never yourself, co-managers by the owner only", () => {
  const asOwner = members(CIRCLE, OWNER);
  assert.deepEqual(asOwner.map((m) => canRemove("owner", m)), [false, true, true, true]);
  const asCo = members(CIRCLE, CO);
  assert.deepEqual(asCo.map((m) => canRemove("co_manager", m)), [false, false, true, true]);
  // Another co-manager, seen by a co-manager: not theirs to remove.
  assert.equal(canRemove("co_manager", { role: "co_manager", isYou: false }), false);
  assert.equal(canRemove("follower", { role: "follower_all", isYou: false }), false);
});

test("pending invites show inline, never saying \"sent\"; Cancel and New link only where the role can", () => {
  const rows = pendingInvites(CIRCLE);
  assert.deepEqual(rows.map((p) => [p.kind, ROLE_LINE[p.role]]), [
    ["co_manager", "Can edit the profile"],
    ["follow", "Sees severe allergens only"],
  ]);
  assert.equal(PENDING_LINE, "Invite link · waiting for someone to accept");
  assert.doesNotMatch(PENDING_LINE, /sent/i);
  assert.ok(canActOnInvite("owner", "co_manager"));
  assert.ok(!canActOnInvite("co_manager", "co_manager"), "a co-manager on a co-manager invite: hidden");
  assert.ok(canActOnInvite("co_manager", "follow"));
  assert.ok(!canActOnInvite("follower", "follow"));
});

test("adding someone: three choices, and no default", () => {
  assert.deepEqual(ADD_CHOICES.map((c) => c.value), ["all", "severe_only", "co_manager"]);
  assert.deepEqual(ADD_CHOICES.map((c) => c.title), ["See all allergens", "See severe allergens only", "Help manage the profile"]);
  assert.equal(inviteUrl("https://x", "co_manager", "t"), "https://x/co-manager/t", "a co-manager comes by invite link only");
  assert.equal(inviteUrl("https://x", "severe_only", "t"), "https://x/follow/t");
});

test("the share message says \"them\", or \"me\" for your own profile; never a pronoun the app doesn't store", () => {
  assert.equal(
    shareMessage(MAYA, "L"),
    "Join Maya's circle on CircleBite so you can check food for them when they're with you: L",
  );
  assert.equal(shareMessage(ME, "L"), "Join my circle on CircleBite so you can check food for me when I'm with you: L");
  assert.doesNotMatch(shareMessage(MAYA, "L"), /\b(her|him|she|he)\b/);
  assert.equal(LINK_FOOTNOTE, "Anyone with this link can join, once. It stops working after the first person accepts. You can cancel it until then.");
});

test("removal and what each role can do, in true sentences with no pronoun", () => {
  assert.equal(removalLine({ name: "Grandma Lou" }, MAYA), "Grandma Lou loses access to Maya's profile straight away.");
  assert.equal(removalLine({ name: "Grandma Lou" }, ME), "Grandma Lou loses access to your profile straight away.");
  assert.equal(whatTheyCanDo("follower_severe", MAYA), "They can see Maya's severe allergens only. Their scans still check every allergen on Maya's profile.");
  assert.equal(whatTheyCanDo("co_manager", MAYA), "They can edit Maya's allergens and invite people to the circle.");
  for (const role of ["owner", "co_manager", "follower_all", "follower_severe"] as const) {
    assert.doesNotMatch(whatTheyCanDo(role, MAYA), /\b(she|he|her|him)\b/i, role);
  }
});

test("a follower's view: who can see the circle, and what they can see", () => {
  assert.equal(whoCanSee({ label: "Maya" }), "Only the people who manage Maya's profile can see who else is in this circle.");
  assert.deepEqual(whatYouCanSee({ label: "Maya", share_level: "all" }), { level: "All allergens", note: null });
  assert.deepEqual(whatYouCanSee({ label: "Maya", share_level: "severe_only" }), {
    level: "Severe allergens only",
    note: "Your scans still check every allergen on Maya's profile.",
  });
});

test("the first circle shown: one named by #circle-<id>, else Scanning for, else the first", () => {
  assert.equal(initialCircle("#circle-p2", "p1", ["p1", "p2"]), "p2");
  assert.equal(initialCircle("", "p2", ["p1", "p2"]), "p2");
  assert.equal(initialCircle("#circle-gone", "zzz", ["p1", "p2"]), "p1");
  assert.equal(initialCircle("", "", []), "");
});
