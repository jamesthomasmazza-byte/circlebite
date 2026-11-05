import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChangeHistory } from "./ChangeHistory";
import type { ProfileHistoryEntry } from "./lib/api";
import { collapsedSummary, splitHistory } from "./lib/changeHistory";

// Prof. Yoest's Condition 2 on the collapsed change history (2026-11-05, BACKLOG item 8): anything the
// owner hasn't acknowledged stays visible, uncollapsed, on top, until it's acknowledged. Rendered as
// HTML from exactly what GET /profiles/:id/changes returns. A closed <details> hides what's inside
// it, so "visible without a tap" means "not inside the <details>".

function entry(id: string, allergen: string, unseen: boolean, createdAt: string): ProfileHistoryEntry {
  return {
    id,
    kind: "allergen_added",
    createdAt,
    actorName: "Priya Nair",
    actorRole: "co_manager",
    actorKnown: true,
    actorIsViewer: false,
    before: null,
    after: { name: allergen, severity: "severe", notes: null, treat_traces_as_unsafe: true },
    downgrade: null,
    unseen,
  };
}

function render(history: ProfileHistoryEntry[] | null, extra: { failed?: boolean; ackFailed?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(ChangeHistory, {
      profileId: "p1",
      profile: { label: "Maya", isSelf: false },
      choices: [],
      history,
      failed: extra.failed ?? false,
      ackFailed: extra.ackFailed ?? false,
      onAcknowledge: () => {},
    }),
  );
}

/** The markup inside the collapsed list, or "" when there is none. */
function collapsed(html: string): string {
  const open = html.indexOf("<details");
  return open < 0 ? "" : html.slice(open, html.indexOf("</details>") + "</details>".length);
}

const UNSEEN_SESAME = entry("u1", "Sesame", true, "2026-11-04T15:00:00Z");
const UNSEEN_EGG = entry("u2", "Egg", true, "2026-11-03T15:00:00Z");
const SEEN_MILK = entry("s1", "Milk", false, "2026-11-02T15:00:00Z");
const SEEN_SOY = entry("s2", "Soy", false, "2026-10-30T15:00:00Z");
const SEEN_WHEAT = entry("s3", "Wheat", false, "2026-10-20T15:00:00Z");

test("an unseen entry renders outside the collapsed list, before it", () => {
  const html = render([UNSEEN_SESAME, UNSEEN_EGG, SEEN_MILK, SEEN_SOY, SEEN_WHEAT]);
  const details = html.indexOf("<details");
  assert.ok(details > 0, "the seen entries are collapsed");
  for (const name of ["Sesame", "Egg"]) {
    const at = html.indexOf(`Priya Nair (co-manager) added ${name}`);
    assert.ok(at > 0 && at < details, `${name} is above the collapsed list`);
    assert.doesNotMatch(collapsed(html), new RegExp(`added ${name}`), `${name} isn't inside it`);
  }
  assert.match(html, /New, not yet reviewed \(2\)/);
  assert.match(html, /I&#x27;ve seen these/);
});

test("the unread block is never inside a <details>, and the collapsed list holds only seen entries", () => {
  const html = render([UNSEEN_SESAME, SEEN_MILK, SEEN_SOY]);
  assert.equal(html.match(/<details/g)?.length, 1, "one collapsed list, no other");
  assert.doesNotMatch(collapsed(html), /data-unseen/, "no unseen entry in it");
  assert.doesNotMatch(collapsed(html), /I&#x27;ve seen these/, "nor the acknowledgement");
  assert.match(collapsed(html), /added Milk[\s\S]*added Soy/);
});

test("with everything unseen there's nothing to collapse", () => {
  const html = render([UNSEEN_SESAME, UNSEEN_EGG]);
  assert.doesNotMatch(html, /<details/);
  assert.match(html, /added Sesame[\s\S]*added Egg[\s\S]*I&#x27;ve seen these/);
});

test("with nothing unseen, the history is closed and says how many it holds", () => {
  const html = render([SEEN_MILK, SEEN_SOY, SEEN_WHEAT]);
  assert.match(html, /<details class="change-history__earlier"><summary>Change history \(3\)<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/, "closed by default");
  assert.doesNotMatch(html, /New, not yet reviewed|I&#x27;ve seen these/);
});

test("an unseen entry stays on top whatever its date", () => {
  // Older than every seen entry, and last in the server's list: still first on the page.
  const oldUnseen = entry("u3", "Mustard", true, "2026-09-01T15:00:00Z");
  const html = render([SEEN_MILK, SEEN_SOY, oldUnseen]);
  assert.ok(html.indexOf("added Mustard") < html.indexOf("<details"));
  assert.deepEqual(splitHistory([SEEN_MILK, SEEN_SOY, oldUnseen]).unseen.map((e) => e.id), ["u3"]);
});

test("an entry moves into the collapsed list when it's acknowledged, and only then", () => {
  const before = render([UNSEEN_SESAME, SEEN_MILK]);
  assert.doesNotMatch(collapsed(before), /added Sesame/);
  const after = render([{ ...UNSEEN_SESAME, unseen: false }, SEEN_MILK]);
  assert.match(collapsed(after), /added Sesame/);
  assert.match(after, /<summary>Change history \(2\)<\/summary>/);
});

test("the summary counts only what the collapsed list holds", () => {
  assert.match(render([UNSEEN_SESAME, UNSEEN_EGG, SEEN_MILK]), /<summary>Earlier changes \(1\)<\/summary>/);
  assert.equal(collapsedSummary(4, true), "Earlier changes (4)");
  assert.equal(collapsedSummary(4, false), "Change history (4)");
});

test("a failed load, or a failed acknowledgement, is never collapsed", () => {
  const failed = render(null, { failed: true });
  assert.match(failed, /role="alert">Couldn&#x27;t load this profile&#x27;s change history/);
  assert.doesNotMatch(failed, /<details/);
  assert.doesNotMatch(failed, /No changes recorded yet/, "never an empty, reassuring history");

  const ackFailed = render([UNSEEN_SESAME, SEEN_MILK], { ackFailed: true });
  const alert = ackFailed.indexOf("Couldn&#x27;t record that");
  assert.ok(alert > 0 && alert < ackFailed.indexOf("<details"));
});

test("the heading is printed once: kept for screen readers when the summary already says it", () => {
  assert.match(render([SEEN_MILK]), /<h2 id="change-history-heading" class="visually-hidden">/);
  for (const html of [render([UNSEEN_SESAME, SEEN_MILK]), render([]), render(null, { failed: true })]) {
    assert.match(html, /<h2 id="change-history-heading">Change history<\/h2>/);
  }
});

test("the section keeps id=changes, where Condition 2's notice links", () => {
  assert.match(render([UNSEEN_SESAME]), /<section id="changes"/);
});
