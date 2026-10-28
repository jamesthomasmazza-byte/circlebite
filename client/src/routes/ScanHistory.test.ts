import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchedAllergen, ScanHistoryEntry } from "../lib/api";
import { historyChangedLine, historyNotCheckedLine, REPORT_NOT_SHARED } from "../lib/historyCopy";
import { ScanHistoryEntryCard } from "./ScanHistory";

// Scan history as one summary per entry, the reasoning in a closed disclosure (2026-10-28 audit;
// BACKLOG.md Week 9, "Scan history repeats itself"). Principle 2: uncertainty is never folded away,
// so "not yet confirmed" and every unchecked allergen stay outside the <details>.

const row = (allergenName: string, over: Partial<MatchedAllergen> = {}): MatchedAllergen => ({
  allergenName,
  matched: false,
  source: null,
  severity: "severe",
  classification: "clear",
  ...over,
});

function entry(over: Partial<ScanHistoryEntry>): ScanHistoryEntry {
  return {
    id: "s1",
    barcode: "2990000000083",
    product_name: "Corn Tortilla Chips",
    product_brand: "Millbrook",
    created_at: "2026-10-26T14:00:00Z",
    original: { result: "safe", matched_allergens: [row("Peanut"), row("Sesame", { severity: "moderate" })] },
    effective: null,
    corrections: [],
    community_reports: [],
    pending_circle_reports: [],
    ...over,
  };
}

function render(scan: ScanHistoryEntry): { outside: string; inside: string } {
  const html = renderToStaticMarkup(createElement(ScanHistoryEntryCard, { scan, profileLabel: "Noor" }));
  const open = html.indexOf("<details");
  if (open === -1) return { outside: html, inside: "" };
  const close = html.indexOf("</details>") + "</details>".length;
  return { outside: html.slice(0, open) + html.slice(close), inside: html.slice(open, close) };
}

// The judge seed's reporter row, as a follower of Noor sees it: Wheat from a co-manager, by role.
const FOLLOWER_CIRCLE = entry({
  original: { result: "safe", matched_allergens: [row("Tree nut"), row("Wheat", { severity: "moderate" })] },
  effective: {
    result: "contains_allergen",
    matched_allergens: [row("Tree nut"), row("Wheat", { severity: "moderate", classification: "contains", circleReported: true })],
  },
  pending_circle_reports: [{ allergenName: "Wheat", reporters: [{ name: null, role: "co_manager", isViewer: false, withheld: true }] }],
});

test("the verdict word, product, rows and what changed it are outside the disclosure; the reasoning inside", () => {
  const { outside, inside } = render(FOLLOWER_CIRCLE);
  assert.match(outside, /data-verdict="contains_allergen"[^>]*>Contains an allergen</);
  assert.match(outside, /Corn Tortilla Chips/);
  assert.match(outside, /Wheat \(moderate\)/, "the allergen row stays visible");
  assert.match(outside, /Changed by a report from your circle, not yet confirmed\./, "the unconfirmed status is never folded away");
  assert.match(inside, /<details class="history-entry__details"><summary>Details<\/summary>/);
  assert.doesNotMatch(inside, /<details[^>]* open/, "closed by default");
  assert.match(inside, /Originally <strong>No listed allergens found<\/strong> — changed because of:/);
  assert.match(inside, /A co-manager in Noor(&#x27;|')s circle reported Wheat/);
});

test("a follower's summary names no reporter, even when the report itself carries a name", () => {
  const named = entry({
    ...FOLLOWER_CIRCLE,
    pending_circle_reports: [{ allergenName: "Wheat", reporters: [{ name: "Sam Okafor", role: "co_manager", isViewer: false }] }],
  });
  assert.equal(historyChangedLine(named), "Changed by a report from your circle, not yet confirmed.");
  assert.doesNotMatch(render(FOLLOWER_CIRCLE).outside, /Sam|Okafor|Priya/);
});

test("every unchecked allergen is named outside the disclosure", () => {
  const scan = entry({
    original: { result: "unable_to_confirm", matched_allergens: [] },
    effective: {
      result: "contains_allergen",
      matched_allergens: [
        row("Peanut", { classification: "contains", communityReported: true, communityReporterCount: 2 }),
        row("Sesame", { severity: "moderate", classification: "unchecked", uncheckedBecause: "no_product_data" }),
      ],
    },
    community_reports: [{ allergenName: "Peanut", reporterCount: 2 }],
  });
  const { outside, inside } = render(scan);
  assert.equal(historyNotCheckedLine(scan), "Not checked: sesame.");
  assert.match(outside, /Not checked: sesame\./);
  assert.match(outside, /Changed by shopper reports\./);
  assert.match(inside, /Couldn(&#x27;|')t check 1 allergen/, "the explanation of it goes inside");
});

test("a rejected report reuses 'reviewed and not accepted', never 'rejected' in the summary", () => {
  const scan = entry({
    corrections: [{ id: "c1", correctionType: "flag_wrong", direction: "remove_caution", allergen: "Peanut", note: null, status: "rejected", createdAt: "2026-10-20T00:00:00Z" }],
  });
  const line = historyChangedLine(scan)!;
  assert.equal(line, "Your report was reviewed and not accepted, so this is the original verdict.");
  assert.doesNotMatch(line, /rejected/);
  assert.match(render(scan).outside, /reviewed and not accepted/);
});

test("severe_only: a change from a hidden allergen's report says only what history already said", () => {
  // What routes/scansHistory.test.ts shows a severe_only follower today: the verdict changed, the
  // mild allergen and its report filtered out, and one line that a report it can't show did it.
  const scan = entry({
    original: { result: "safe", matched_allergens: [row("Peanut")] },
    effective: { result: "contains_allergen", matched_allergens: [row("Peanut")] },
  });
  const line = historyChangedLine(scan)!;
  assert.equal(line, "Changed by a report about an allergen on this profile that isn't shared with you.");
  const { outside, inside } = render(scan);
  // Nothing beyond that sentence: no allergen name but the shared one, no severity, no reporter.
  assert.doesNotMatch(outside + inside, /Egg|mild|moderate|circle|shopper|not yet confirmed/i);
  assert.match(inside, new RegExp(REPORT_NOT_SHARED.replace(/'/g, "(&#x27;|')")));
  assert.equal(historyNotCheckedLine(scan), null);
});

test("an entry nothing changed has no summary line and no disclosure", () => {
  const { outside, inside } = render(entry({}));
  assert.equal(inside, "");
  assert.doesNotMatch(outside, /Changed by|Not checked/);
});
