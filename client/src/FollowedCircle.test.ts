import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FollowedCircle } from "./FollowedCircle";
import type { ProfileSummary } from "./lib/api";

// A follower's view of a circle they're in (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN).

const SRC = readFileSync(new URL("./FollowedCircle.tsx", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("./routes/CircleRedesign.tsx", import.meta.url), "utf8");
const profile = (share_level: "all" | "severe_only"): ProfileSummary => ({ id: "p", label: "Maya", is_self: false, share_level, allergen_names: [] });
const render = (level: "all" | "severe_only") => renderToStaticMarkup(createElement(FollowedCircle, { profile: profile(level), onLeft: () => {} }));

test("a follower never sees other members: only the profile and \"You\", no names, no count", () => {
  const html = render("all");
  assert.equal(html.match(/circle-diagram__bubble /g)?.length, 1);
  assert.match(html, /circle-diagram__bubble--you"[^>]*>You</);
  assert.doesNotMatch(html, /member-list|member-row--person|\d+ (people|members)/);
  // Nothing on this view, or the page's path to it, reads the circle: the server's 404 for a
  // follower stays the only answer, and no member's name reaches this browser.
  assert.doesNotMatch(SRC, /getCircle|CircleData/);
  const followedBranch = PAGE.slice(PAGE.indexOf("{followed && ("));
  assert.match(followedBranch, /^\{followed && \(\s*<FollowedCircle\s+key=\{followed\.id\}\s+profile=\{followed\}\s+onLeft=/);
});

test("who can see the circle, said truly", () => {
  assert.match(render("all"), /Only the people who manage Maya&#x27;s profile can see who else is in this circle\./);
});

test("what you can see: all allergens, or severe only with the line that scans still check every one", () => {
  assert.match(render("all"), /<strong>All allergens<\/strong>/);
  assert.doesNotMatch(render("all"), /still check/);
  const severe = render("severe_only");
  assert.match(severe, /<strong>Severe allergens only<\/strong>/);
  assert.match(severe, /Your scans still check every allergen on Maya&#x27;s profile\./);
});

test("Leave: red, a second tap, then POST /profiles/:id/leave, with what happens under it", () => {
  const html = render("all");
  assert.match(html, /<button type="button" class="button-danger">Leave Maya&#x27;s circle<\/button>/);
  assert.match(html, /You&#x27;ll stop seeing Maya&#x27;s profile straight away\. To rejoin, you&#x27;ll need a new invite\./);
  assert.match(SRC, /onClick=\{\(\) => setConfirming\(true\)\}/);
  assert.match(SRC, /await leaveCircle\(profile\.id\);/);
});
