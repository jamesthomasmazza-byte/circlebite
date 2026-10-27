import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { AskToFollow, FollowRequests } from "./CircleRequests";
import { RequestNotice } from "./TabShell";

// Follow requests (2026-10-27, behind CIRCLE_REQUESTS; server routes/circleRequests.ts).

const REQUEST = {
  id: "r1",
  created_at: "2026-10-27T12:00:00Z",
  requester_name: "Sam Okafor",
  requester_email: "sam@example.com",
  profiles: [
    { id: "p1", label: "Maya" },
    { id: "p2", label: "Leo" },
  ],
};

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
const SHELL = readFileSync(new URL("./TabShell.tsx", import.meta.url), "utf8");
const CIRCLE = readFileSync(new URL("./routes/Circle.tsx", import.meta.url), "utf8");

test("a request card names who asked, offers the owner's own profiles and both share levels, none chosen", () => {
  const html = render(createElement(FollowRequests, { requests: [REQUEST], onChanged: () => {} }));
  assert.match(html, /Sam Okafor \(sam@example\.com\) asked to follow one of your profiles\./);
  assert.match(html, /Approve only someone you know\. Check the email address\./);
  for (const label of ["Maya", "Leo", "Full profile", "Severe allergens only"]) assert.match(html, new RegExp(`/>${label}</label>`));
  assert.doesNotMatch(html, /checked/, "nothing preselected");
  assert.match(html, />Approve<\/button>/);
  assert.match(html, />Decline<\/button>/);
});

test("with nothing left to share, only Decline", () => {
  const html = render(createElement(FollowRequests, { requests: [{ ...REQUEST, profiles: [] }], onChanged: () => {} }));
  assert.match(html, /They already follow every profile you own\./);
  assert.doesNotMatch(html, />Approve</);
});

test("no requests, no section", () => {
  assert.equal(render(createElement(FollowRequests, { requests: [], onChanged: () => {} })), "");
});

test("the ask form says what the owner will see before anything is sent", () => {
  const html = render(createElement(AskToFollow));
  assert.match(html, /The parent&#x27;s email address/);
  assert.match(html, /They&#x27;ll see your name and email address\. You&#x27;ll see nothing about their profiles unless they approve\./);
  assert.match(html, /type="email"/);
});

test("Scan's request line: one line with a Review link to the Circle tab", () => {
  const html = render(createElement(RequestNotice, { requests: [REQUEST] }));
  assert.match(html, /Sam Okafor \(sam@example\.com\) asked to follow one of your profiles\. <a href="\/circle#follow-requests"[^>]*>Review<\/a>/);
  assert.equal(render(createElement(RequestNotice, { requests: [] })), "");
});

test("Condition 2's notices come first on Scan; the request line only after them, and only on Scan", () => {
  const notices = SHELL.slice(SHELL.indexOf('<div className="tab-shell__notices">'), SHELL.indexOf("</div>", SHELL.indexOf('<div className="tab-shell__notices">')));
  assert.ok(notices.indexOf("<LandingNotices") < notices.indexOf("<RequestNotice"), "after Condition 2's");
  assert.match(notices, /\{current === "scan" && <RequestNotice requests=\{requests\} \/>\}/);
});

test("the Circle tab carries a badge for waiting requests, and says it to a screen reader", () => {
  // Inside the icon, as the Profile badge is: the icon is what the badge is positioned against.
  const icon = SHELL.slice(SHELL.indexOf('<span className="tab-bar__icon"'), SHELL.indexOf("</span>\n            <span className=\"tab-bar__label\">"));
  assert.match(icon, /\{tab === "circle" && requests\.length > 0 && \(\s*<span className="tab-bar__badge">/);
  assert.match(SHELL, /requestBadgeLabel\(requests\.length\)/);
});

test("requests are read only with the switch on, and again after one is decided", () => {
  assert.match(SHELL, /if \(!circleRequestsEnabled\) \{\s*setRequests\(\[\]\);/);
  assert.match(SHELL, /\}, \[pathname, circleRequestsEnabled, requestsRead\]\);/);
  assert.match(CIRCLE, /\{circleRequestsEnabled && <AskToFollow \/>\}/);
  assert.match(CIRCLE, /<FollowRequests requests=\{requests\} onChanged=\{\(\) => void afterRequestDecided\(\)\} \/>/);
});

test("approving can't go without both choices, and sends exactly those", () => {
  const source = readFileSync(new URL("./CircleRequests.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!profileId \|\| !shareLevel\) \{\s*setError\(CHOOSE_BOTH\);\s*return;/);
  assert.match(source, /approveCircleRequest\(request\.id, profileId, shareLevel\)/);
  assert.match(source, /useState<string \| null>\(null\)/);
  assert.match(source, /useState<ShareLevel \| null>\(null\)/);
});
