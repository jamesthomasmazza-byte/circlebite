import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The redesigned Circle tab (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN). The page fetches on
// mount, so these read the source; the rules it uses are tested in lib/circleRedesign.test.ts.

const PAGE = readFileSync(new URL("./CircleRedesign.tsx", import.meta.url), "utf8");
const CIRCLE = readFileSync(new URL("./Circle.tsx", import.meta.url), "utf8");

test("with CIRCLE_REDESIGN off, the Circle tab is today's, unchanged", () => {
  assert.match(CIRCLE, /return circleRedesignEnabled \? <CircleRedesign \/> : <CircleClassic \/>;/);
  const classic = CIRCLE.slice(CIRCLE.indexOf("function CircleClassic()"));
  assert.match(classic, /<CircleManage profile=\{profile\} circle=\{circle\}/, "today's management, as before");
  assert.doesNotMatch(classic, /CircleRedesign|CircleDiagram/);
  // The switch's own default is off until /me says otherwise (lib/AuthContext.tsx).
  const auth = readFileSync(new URL("../lib/AuthContext.tsx", import.meta.url), "utf8");
  assert.match(auth, /const \[circleRedesignEnabled, setCircleRedesignEnabled\] = useState\(false\);/);
});

test("one pill per profile you manage or follow; it opens on Scanning for, or an old #circle-<id> link", () => {
  assert.match(PAGE, /profiles\.managed\.map\(\(p\) => \(\s*<button[^>]*aria-pressed=\{p\.id === selectedId\}/);
  assert.match(PAGE, /profiles\.followed\.map\(\(p\) => \(\s*<button[^>]*aria-pressed=\{p\.id === selectedId\}/);
  assert.match(PAGE, /pillLabel\(p, true\)/);
  assert.match(PAGE, /initialCircle\(location\.hash, scanningForId\(chosenProfileId, all\), ids\)/);
});

test("waiting invites sit in the same list as the people, greyed, with their actions inline", () => {
  const list = PAGE.slice(PAGE.indexOf('<ul className="member-list">'), PAGE.indexOf("</ul>", PAGE.indexOf('<ul className="member-list">')));
  assert.match(list, /people\.map\(/);
  assert.match(list, /waiting\.map\(\(p\) => \(\s*<li key=\{p\.key\} className="member-row member-row--pending">/);
  assert.match(list, /\{PENDING_LINE\}/);
  assert.match(list, /\{canActOnInvite\(viewer, p\.kind\) && \(/, "hidden where the role can't use them");
  assert.match(list, /\{NEW_LINK\}[\s\S]*\{CANCEL_INVITE\}/);
  assert.doesNotMatch(PAGE, /pendingInviteLine|not used yet/, "today's wording is gone from this tab");
});

test("New link cancels before it makes, so two links are never live for one invite", () => {
  const act = PAGE.slice(PAGE.indexOf("async function act("), PAGE.indexOf("const heading ="));
  assert.ok(act.indexOf("cancelFollowInvite : cancelManagerInvite") < act.indexOf("createFollowInvite("));
  assert.match(act, /setError\(CANCEL_FAILED\);\s*return;/, "a failed cancel makes nothing");
});

test("one heading, the circle showing; pills straight under it only with two or more circles", () => {
  // JT, 2026-11-06: "Circle", one pill and "<name>'s circle" said it three times.
  assert.match(PAGE, /<h1 id="circle-heading">\{circleHeading\(managed \?\? followed\)\}<\/h1>\s*\{showCirclePills\(profiles\.managed\.length \+ profiles\.followed\.length\) && \(\s*<div className="circle-pills"/);
  assert.equal(PAGE.match(/<h1\b/g)?.length, 2, "the page's h1, and the load error's");
  assert.doesNotMatch(PAGE, /<h2\b/, "no second heading for the circle");
  assert.doesNotMatch(readFileSync(new URL("../FollowedCircle.tsx", import.meta.url), "utf8"), /<h[12]\b/);
});

test("follow requests work as on today's tab: under the pills, the form behind a link", () => {
  assert.ok(PAGE.indexOf('className="circle-pills"') < PAGE.indexOf("<FollowRequests"));
  assert.match(PAGE, /\{circleRequestsEnabled && \(\s*<p className="circle-join">/);
  assert.match(PAGE, /\{circleRequestsEnabled && askOpen && <AskToFollow \/>\}/);
});
