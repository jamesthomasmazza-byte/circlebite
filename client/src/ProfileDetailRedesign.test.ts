import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import type { ProfileAccess, ProfileDetail, ProfileHistoryEntry } from "./lib/api";
import { ProfileDetailRedesign } from "./ProfileDetailRedesign";

// The redesigned profile page (JT, 2026-11-06, behind PROFILE_REDESIGN). Rendered as each role; the
// page's data loads in effects, which a static render doesn't run, so the stats it fetches (circle,
// scans) are checked in the source.

const SRC = readFileSync(new URL("./ProfileDetailRedesign.tsx", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("./routes/ProfileDetail.tsx", import.meta.url), "utf8");

const OWNER: ProfileAccess = { level: "owner" };
const CO: ProfileAccess = { level: "co_manager" };
const FULL: ProfileAccess = { level: "follower", shareLevel: "all" };
const SEVERE: ProfileAccess = { level: "follower", shareLevel: "severe_only" };

function profile(access: ProfileAccess): ProfileDetail {
  return {
    id: "p1",
    label: "Maya",
    is_self: false,
    access,
    allergens: [{ id: "a1", name: "Peanut", severity: "severe", notes: null, treat_traces_as_unsafe: true, allergen_key: "peanut", key_needs_review: false }],
  } as unknown as ProfileDetail;
}

function unseenEntry(): ProfileHistoryEntry {
  return {
    id: "c1",
    kind: "allergen_added",
    createdAt: "2026-11-06T12:00:00Z",
    actorName: "Priya Nair",
    actorRole: "co_manager",
    actorKnown: true,
    actorIsViewer: false,
    before: null,
    after: { name: "Egg", severity: "mild", notes: null, treat_traces_as_unsafe: false },
    downgrade: null,
    unseen: true,
  };
}

function render(access: ProfileAccess, opts: { hash?: string; showScanFor?: boolean; showSnacks?: boolean; history?: ProfileHistoryEntry[] } = {}): string {
  const manages = access.level !== "follower";
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`/profiles/p1${opts.hash ?? ""}`] },
      createElement(ProfileDetailRedesign, {
        id: "p1",
        profile: profile(access),
        viewerId: "u1",
        canManage: manages,
        isOwner: access.level === "owner",
        showScanFor: opts.showScanFor ?? false,
        showSnacks: opts.showSnacks ?? false,
        choices: [],
        history: opts.history ?? [],
        historyFailed: false,
        ackFailed: false,
        reviewFor: () => null,
        onAddAllergen: async () => {},
        onUpdateAllergen: async () => {},
        onRemoveAllergen: async () => {},
        onAcknowledge: () => {},
        onDelete: () => {},
      }),
    ),
  );
}

test("a follower never sees the circle count, the Changes tab or the ⋯ menu; the circle isn't even asked for", () => {
  for (const access of [FULL, SEVERE]) {
    const html = render(access, { hash: "#changes" });
    assert.doesNotMatch(html, /in circle/);
    assert.doesNotMatch(html, /id="tab-changes"|id="panel-changes"/);
    assert.doesNotMatch(html, /More options for/);
    assert.match(html, /id="panel-allergens"/, "#changes falls back to Allergens");
  }
  assert.match(SRC, /if \(p\.canManage\) \{\s*getCircle\(id\)/);
  assert.match(SRC, /\{p\.canManage && inCircle !== null && <li>\{inCircleStat\(inCircle\)\}<\/li>\}/);
});

test("a severe-only follower: the notice above the list, the severe names as sent, and the role line", () => {
  const html = render(SEVERE);
  assert.match(html, /<p role="note">Only severe allergens are shared with you\. Your scans still check every allergen on Maya&#x27;s profile\.<\/p><ul class="card-list allergen-cards">/);
  assert.match(html, /You follow · severe allergens only/);
  assert.doesNotMatch(render(FULL), /Only severe allergens are shared/);
});

test("#changes opens the Changes tab for the owner and co-managers (Condition 2's links)", () => {
  for (const access of [OWNER, CO]) {
    const html = render(access, { hash: "#changes" });
    assert.match(html, /id="tab-changes" aria-selected="true"/);
    assert.match(html, /<section role="tabpanel" id="panel-changes"[^>]*><section id="changes" class="change-history"/);
  }
  assert.match(render(OWNER, { hash: "#scans" }), /id="panel-scans"/);
});

test("the unseen block is never collapsed, and the Changes tab says how many are new", () => {
  const html = render(OWNER, { hash: "#changes", history: [unseenEntry()] });
  const unseen = html.indexOf("change-history__unseen");
  assert.ok(unseen > 0);
  assert.ok(html.lastIndexOf("<details", unseen) < html.lastIndexOf("</details>", unseen) || html.lastIndexOf("<details", unseen) === -1, "not inside a details");
  assert.match(html, /Changes<span class="profile-tabs__badge">1 new<\/span>/);
});

test("Scan for only with two or more profiles to scan for; Add an allergen once, in the header, for managers", () => {
  assert.doesNotMatch(render(OWNER), /Scan for Maya/);
  assert.match(render(OWNER, { showScanFor: true }), /href="\/scan\?profile=p1"[^>]*>Scan for Maya<\/a>/);
  // JT, 2026-11-06: the button under the list repeated the header's.
  for (const access of [OWNER, CO]) {
    const html = render(access);
    assert.equal(html.match(/>Add an allergen</g)?.length, 1, "once");
    assert.ok(html.indexOf(">Add an allergen<") < html.indexOf('role="tablist"'), "in the header");
  }
  assert.doesNotMatch(render(FULL), /Add an allergen/);
  assert.match(SRC, /openRequest=\{addRequest\}\s+showOpenButton=\{false\}/);
});

test("Delete lives in the owner's ⋯ menu only, and goes through today's confirm step", () => {
  assert.match(render(OWNER), /aria-label="More options for Maya"/);
  assert.doesNotMatch(render(CO), /More options for/, "its one item is the owner's alone");
  assert.match(SRC, /const hasMenu = p\.isOwner;/);
  assert.match(PAGE, /async function handleDeleteProfile\(\) \{\s*if \(!window\.confirm\(`Delete \$\{profile!\.label\}'s profile\? This can't be undone\.`\)\) return;/);
  assert.match(PAGE, /onDelete=\{\(\) => void handleDeleteProfile\(\)\}/);
  assert.doesNotMatch(SRC.slice(SRC.indexOf('<div className="profile-hero">')), /Delete this profile/, "no Delete in the page body");
});

test("the Scans tab: tiles with the exact verdict label, then the disclaimer and the 911 line", () => {
  const html = render(FULL, { hash: "#scans" });
  assert.match(html, /<div role="note" class="verdict-card__disclaimer scan-history__disclaimer"><p>This is a screening aid, not a guarantee — always check the physical label, especially for “may contain” warnings\.<\/p><p><strong>If anyone has an allergic reaction, call 911\.<\/strong><\/p><\/div>/);
  assert.match(SRC, /data-verdict=\{shown\.result\}>\s*\{VERDICT_LABEL\[shown\.result\]\}/);
  assert.match(SRC, /<ScanHistoryEntryCard scan=\{openScan\} profileLabel=\{profile\.label\} \/>/, "a tile opens today's history card");
  assert.match(html, />Scans<\/button>/, "\"Scans\" for every role: the history is every scan of the profile");
});

test("switch off is today's page; the #circle redirect and #changes jump are shared", () => {
  assert.match(PAGE, /const \{ profileRedesignEnabled: redesign, snackListEnabled, user \} = useAuth\(\);/);
  const branch = PAGE.indexOf("if (redesign) {");
  assert.ok(branch > PAGE.indexOf('if (id && canManage && location.hash === "#circle")'), "after the shared hooks");
  assert.ok(PAGE.indexOf("<ChangeHistory", branch) > 0 && PAGE.indexOf('<Link to="/profiles">← Your profiles</Link>') > branch);
});

// Snack lists (docs/snack-list-plan.md step 9, 2026-11-13): "Snacks →" on the profile page, both
// layouts, for every role, only while SNACK_LIST is on.
test("'Snacks →' links to the profile's list on both layouts, behind SNACK_LIST", () => {
  assert.match(PAGE, /showSnacks=\{snackListEnabled\}/);
  assert.match(PAGE, /\{snackListEnabled && \(\s*<p>\s*<Link to=\{snacksPath\(id\)\}>\{SNACKS_LINK\}<\/Link>/);
  assert.match(SRC, /\{p\.showSnacks && \(\s*<Link to=\{snacksPath\(id\)\} className="button-link">\s*\{SNACKS_LINK\}/);
  for (const access of [OWNER, CO, FULL, SEVERE]) {
    assert.match(render(access, { showSnacks: true }), /href="\/snacks\?profile=p1"[^>]*>Snacks →<\/a>/, access.level);
    assert.doesNotMatch(render(access, { showSnacks: false }), /\/snacks/, `${access.level}, switch off`);
  }
});
