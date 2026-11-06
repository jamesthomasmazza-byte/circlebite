import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Member, Role } from "./lib/circleRedesign";
import { MemberSheet } from "./MemberSheet";

// One person in a circle (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN).

const MAYA = { id: "p", label: "Maya", is_self: false };
const LOU: Member = { key: "f", removeId: "f1", name: "Grandma Lou", isYou: false, role: "follower_all", joined: "2026-10-05T12:00:00Z" };
const ALEX: Member = { key: "m", removeId: "u2", name: "Alex Kim", isYou: false, role: "co_manager", joined: "2026-10-02T12:00:00Z" };
const SAM: Member = { key: "o", removeId: null, name: "Sam Rivera", isYou: false, role: "owner", joined: null };

const render = (member: Member, viewer: Role) =>
  renderToStaticMarkup(createElement(MemberSheet, { member, profile: MAYA, viewer, onClose: () => {}, onRemoved: () => {} }));

test("the name, when they joined, and what they can do", () => {
  const html = render(LOU, "owner");
  assert.match(html, /<h2 id="member-sheet-title">Grandma Lou<\/h2>/);
  assert.match(html, /Joined Oct \d, 2026/);
  assert.match(html, /<h3 id="member-sheet-can">What they can do<\/h3>/);
  assert.match(html, /<strong>Sees all allergens<\/strong>/);
  assert.match(html, /They can see all of Maya&#x27;s allergens and scan food for Maya\./);
  assert.doesNotMatch(render(SAM, "co_manager"), /Joined/, "the owner made the profile; no join date");
});

test("Remove, with the true line under it, only where the viewer's role can", () => {
  const html = render(LOU, "co_manager");
  assert.match(html, /<button type="button" class="button-danger">Remove from Maya&#x27;s circle<\/button>/);
  assert.match(html, /Grandma Lou loses access to Maya&#x27;s profile straight away\./);
  assert.doesNotMatch(render(ALEX, "co_manager"), /Remove from/, "a co-manager can't remove a co-manager");
  assert.match(render(ALEX, "owner"), /Remove from/);
  assert.doesNotMatch(render(SAM, "co_manager"), /Remove from|loses access/, "nobody removes the owner");
  assert.doesNotMatch(render({ ...ALEX, isYou: true, name: "You" }, "co_manager"), /Remove from/, "or themselves");
});

test("Remove takes a second tap, then today's endpoint for that kind of member", () => {
  const src = readFileSync(new URL("./MemberSheet.tsx", import.meta.url), "utf8");
  assert.match(src, /onClick=\{\(\) => setConfirming\(true\)\}/);
  assert.match(src, /\{CONFIRM_REMOVE\}/);
  assert.match(src, /await \(member\.role === "co_manager" \? removeManager : revokeFollow\)\(profile\.id, member\.removeId\);/);
  assert.doesNotMatch(src, /window\.confirm/);
});
