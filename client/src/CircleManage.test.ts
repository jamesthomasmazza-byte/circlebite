import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CircleManage } from "./CircleManage";
import type { CircleData } from "./lib/api";
import { circleCardHref } from "./lib/inviteCopy";

// Invites and invite management on the Circle tab (2026-11-05, BACKLOG item 10). One CircleManage per
// managed profile's card; the one-time invite link is that component's own state, so a link made for
// Maya can only show under Maya's card. Display names only, as the tab always showed.

const MAYA = { id: "maya", label: "Maya", is_self: false, relationship: "owner" as const };
const LEO = { id: "leo", label: "Leo", is_self: false, relationship: "co_manager" as const };

const FULL: CircleData = {
  owner: { user_id: "judge1", display_name: "Judge 1" },
  managers: [{ user_id: "priya", added_at: "2026-11-01T00:00:00Z", display_name: "Priya Nair", email: "priya@demo.test" }],
  followers: [
    { id: "f1", share_level: "severe_only", responded_at: "2026-11-01T00:00:00Z", display_name: "Grandma Rose", email: "rose@demo.test" },
  ],
  pendingFollows: [
    { id: "pf1", share_level: "all", message: null, created_at: "2026-11-02T00:00:00Z", sent_by_id: "judge1", sent_by_name: "Judge 1" },
  ],
  pendingManagerInvites: [],
};

const EMPTY: CircleData = { owner: null, managers: [], followers: [], pendingFollows: [], pendingManagerInvites: [] };

function render(profile: typeof MAYA | typeof LEO, circle: CircleData, viewerId = "judge1"): string {
  return renderToStaticMarkup(createElement(CircleManage, { profile, circle, viewerId, onChanged: async () => {} }));
}

test("the owner's card: people with Revoke and Remove, the invites waiting, and the invite forms", () => {
  const html = render(MAYA, FULL);
  assert.match(html, /Priya Nair — co-manager <button type="button">Remove<span class="visually-hidden"> Priya Nair<\/span>/);
  assert.match(html, /Grandma Rose — follows \(severe allergens only\) <button type="button">Revoke<span class="visually-hidden"> Grandma Rose/);
  assert.match(html, /<h3>Invites waiting to be accepted<\/h3>[\s\S]*Follow invite you sent \(full profile\) · not used yet/);
  assert.match(html, /<h3>Invite someone<\/h3>[\s\S]*<button type="submit">Create invite link<\/button>[\s\S]*Invite a co-manager/);
  assert.doesNotMatch(html, /copy-link/, "no link until one is made, in this card");
});

test("display names only: no email address on the Circle tab", () => {
  assert.doesNotMatch(render(MAYA, FULL), /@demo\.test/);
});

test("a co-manager's card says whose it is, calls them You, and offers no Remove", () => {
  const circle: CircleData = {
    ...FULL,
    owner: { user_id: "sam", display_name: "Sam Okafor" },
    managers: [{ user_id: "judge1", added_at: "2026-11-01T00:00:00Z", display_name: "Judge 1", email: "j@demo.test" }],
  };
  const html = render(LEO, circle);
  assert.match(html, /<li>Sam Okafor — owner<\/li>/);
  assert.match(html, /<li>You — co-manager\s*<\/li>/);
  assert.doesNotMatch(html, />Remove</, "removing a co-manager is the owner's alone");
  assert.match(html, />Revoke</, "any manager can revoke a follower, as before");
});

test("an empty circle says so, then the invite form, in the same card", () => {
  const html = render(MAYA, EMPTY);
  assert.match(html, /Just you, so far\. Invite someone to follow or co-manage:[\s\S]*<form/);
  assert.doesNotMatch(html, /Invites waiting/);
});

test("each card's form controls are named for its own profile", () => {
  const maya = render(MAYA, EMPTY);
  const leo = render(LEO, EMPTY);
  assert.match(maya, /aria-label="What they can see of Maya&#x27;s profile"/);
  assert.match(maya, /aria-label="Message with the invite to Maya&#x27;s profile \(optional\)"/);
  assert.match(leo, /aria-label="What they can see of Leo&#x27;s profile"/);
});

test("the invite link is each card's own state; the tab and the profile page hold none", () => {
  const manage = readFileSync(new URL("./CircleManage.tsx", import.meta.url), "utf8");
  const tab = readFileSync(new URL("./routes/Circle.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("./routes/ProfileDetail.tsx", import.meta.url), "utf8");
  assert.match(manage, /const \[inviteLink, setInviteLink\] = useState<string \| null>\(null\);/);
  // One CircleManage per card, the card keyed by its profile: React never reuses Maya's for Leo's.
  assert.match(tab, /<section\s+key=\{profile\.id\}[\s\S]*?<CircleManage profile=\{profile\}/);
  for (const src of [tab, page]) {
    assert.doesNotMatch(src, /createFollowInvite|createManagerInvite|CopyLink|InviteLink/);
  }
});

test("the profile page doesn't link to the circle; its old #circle link goes on to the Circle tab", () => {
  // JT, 2026-11-06: the Circle heading and link left the profile page, as redundant with the tab.
  const page = readFileSync(new URL("./routes/ProfileDetail.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<h2>Circle<\/h2>|<Link to=\{circleCardHref|manage .* circle/);
  // /profiles/:id#circle (the Circle tab's link until 2026-11-05) lands on the profile's card.
  assert.equal(circleCardHref("maya"), "/circle#circle-maya");
  assert.match(
    page,
    /if \(id && canManage && location\.hash === "#circle"\) navigate\(circleCardHref\(id\), \{ replace: true \}\);/,
  );
  assert.doesNotMatch(page, /<form onSubmit=\{handleCreateFollowInvite\}|removeManager|revokeFollow/);
  const tab = readFileSync(new URL("./routes/Circle.tsx", import.meta.url), "utf8");
  assert.match(tab, /id=\{`circle-\$\{profile\.id\}`\}/, "the card carries the id the redirect points at");
  assert.match(tab, /location\.hash\.startsWith\("#circle-"\)/, "and the tab jumps to it");
});
