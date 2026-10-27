import assert from "node:assert/strict";
import { test } from "node:test";

import { ASK_NOTE, ASK_SENT, requestBadgeLabel, requestLine, requestNoticeLine, SHARE_CHOICES } from "./circleRequestCopy";

test("the form tells the requester the owner sees their name and email, and that they'll see nothing back", () => {
  assert.match(ASK_NOTE, /They'll see your name and email address\./);
  assert.match(ASK_NOTE, /You'll see nothing about their profiles unless they approve\./);
});

test("the answer after sending never says whether the address has an account", () => {
  assert.match(ASK_SENT, /^Request sent\. If that address has a CircleBite account/);
  assert.doesNotMatch(ASK_SENT, /\b(no account|not found|doesn't|isn't|declined|waiting|already)\b/i);
});

test("the owner's line names who asked, by name and email, and no profile", () => {
  assert.equal(
    requestLine({ requester_name: "Sam Okafor", requester_email: "sam@example.com" }),
    "Sam Okafor (sam@example.com) asked to follow one of your profiles.",
  );
});

test("share level choices are the two a follow can have", () => {
  assert.deepEqual(SHARE_CHOICES.map((c) => c.value), ["all", "severe_only"]);
});

test("the Circle badge's spoken label", () => {
  assert.equal(requestBadgeLabel(1), "1 follow request");
  assert.equal(requestBadgeLabel(3), "3 follow requests");
});

test("Scan's notice is one line: the request, or how many", () => {
  const sam = { requester_name: "Sam Okafor", requester_email: "sam@example.com" };
  assert.equal(requestNoticeLine([sam]), requestLine(sam));
  assert.equal(requestNoticeLine([sam, sam, sam]), "3 people asked to follow your profiles.");
});
