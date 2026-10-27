import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CopyLink } from "../CopyLink";
import { PendingInvites } from "../PendingInvites";
import type { CircleData } from "./api";
import { pendingInviteLine } from "./inviteCopy";

test("a pending invite says what it is, who sent it, and that it isn't used yet", () => {
  const mine = { sentById: "me", sentByName: "JT" };
  assert.equal(pendingInviteLine({ kind: "follow", shareLevel: "all", ...mine }, "me"), "Follow invite you sent (full profile) · not used yet");
  assert.equal(
    pendingInviteLine({ kind: "follow", shareLevel: "severe_only", sentById: "p", sentByName: "Priya Nair" }, "me"),
    "Follow invite Priya Nair sent (severe allergens only) · not used yet",
  );
  assert.equal(pendingInviteLine({ kind: "co_manager", ...mine }, "me"), "Co-manager invite you sent · not used yet");
  // An account that's gone: no "you", no name — never a guess.
  assert.equal(pendingInviteLine({ kind: "co_manager", sentById: null, sentByName: null }, "me"), "Co-manager invite · not used yet");
});

const CIRCLE: CircleData = {
  owner: { user_id: "owner", display_name: "Sam" },
  pendingFollows: [
    { id: "f1", share_level: "all", message: null, created_at: "", sent_by_id: "co", sent_by_name: "Priya Nair" },
  ],
  followers: [],
  pendingManagerInvites: [{ id: "m1", created_at: "", sent_by_id: "owner", sent_by_name: "Sam" }],
  managers: [],
};

function render(isOwner: boolean, viewerId: string): string {
  return renderToStaticMarkup(
    createElement(PendingInvites, { profileId: "p", circle: CIRCLE, isOwner, viewerId, onChanged: async () => {} }),
  );
}

test("the owner can cancel or replace both kinds", () => {
  const html = render(true, "owner");
  assert.match(html, /Co-manager invite you sent · not used yet/);
  assert.match(html, /Follow invite Priya Nair sent \(full profile\) · not used yet/);
  assert.equal(html.match(/>Cancel</g)?.length, 2);
  assert.equal(html.match(/>New link</g)?.length, 2);
});

test("a co-manager sees the co-manager invite without its buttons: that's the owner's (server circle.ts)", () => {
  const html = render(false, "co");
  assert.match(html, /Co-manager invite Sam sent · not used yet<\/li>/);
  assert.match(html, /Follow invite you sent \(full profile\) · not used yet/);
  assert.equal(html.match(/>Cancel</g)?.length, 1);
  assert.equal(html.match(/>New link</g)?.length, 1);
});

test("a link shown once comes with Copy link, and stays selectable for copying by hand", () => {
  const html = renderToStaticMarkup(createElement(CopyLink, { url: "https://circlebite.app/follow/abc" }));
  assert.match(html, /Invite link \(copy it now — it won&#x27;t be shown again\):/);
  assert.match(html, /<input readonly="" value="https:\/\/circlebite.app\/follow\/abc"\/>/);
  assert.match(html, />Copy link</);
});
