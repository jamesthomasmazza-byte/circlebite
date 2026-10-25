import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { LandingNotices, type NoticeData } from "./LandingNotices";
import type { ProfileSummary, UnseenProfileChanges } from "./lib/api";

// Prof. Yoest's Condition 2: an owner never learns of a co-manager's change by accident. The app
// opens on Scan (lib/tabs.ts), so the landing screen itself has to say it — rendered here as HTML,
// with no navigation, from exactly what /me/unseen-changes returns.

const COMANAGER_CHANGE: UnseenProfileChanges = {
  profileId: "p1",
  label: "James Mazza",
  isSelf: false,
  count: 3,
  actorNames: ["Timmy"],
  outsideApp: false,
  unnamedActor: false,
  hasDowngrade: true,
  hasProfileChange: true,
};

const NEEDS_LOOK: ProfileSummary = { id: "p1", label: "James Mazza", is_self: false, relationship: "owner", allergens_needing_review: 1, allergen_names: [] };

function render(data: Partial<NoticeData>): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(LandingNotices, { unseen: [], unseenFailed: false, needsReview: [], ...data })),
  );
}

test("a co-manager's change is on the landing screen: who, whose profile, and a way to review it", () => {
  const html = render({ unseen: [COMANAGER_CHANGE] });
  assert.match(html, /Changes to review/);
  assert.match(html, /Timmy changed James Mazza&#x27;s profile and disputed a scan warning — 3 updates you haven&#x27;t reviewed/);
  assert.match(html, /href="\/profiles\/p1#changes"/);
  assert.doesNotMatch(html, /dismiss/i, "no way to wave it away unseen");
});

test("allergens needing a look are on the landing screen too, linked to the profile", () => {
  const html = render({ needsReview: [NEEDS_LOOK] });
  assert.match(html, /1 allergen on James Mazza&#x27;s profile needs a look/);
  assert.match(html, /href="\/profiles\/p1"/);
});

test("a failed check says so — an empty landing must never mean 'we couldn't look'", () => {
  assert.match(render({ unseenFailed: true }), /Couldn&#x27;t check whether anyone changed your profiles/);
  assert.equal(render({}), "");
});
