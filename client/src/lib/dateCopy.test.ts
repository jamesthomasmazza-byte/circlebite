import assert from "node:assert/strict";
import { test } from "node:test";

import { shortDateTime } from "./dateCopy";

const EN = { locale: "en-US", timeZone: "America/New_York" };
const NOW = new Date("2026-10-28T16:00:00Z");

// U+202F (narrow no-break space) before AM/PM in newer ICU builds; normalised for the comparison.
const plain = (s: string) => s.replace(/ /g, " ");

test("month, day and time, with no seconds and no year this year", () => {
  assert.equal(plain(shortDateTime("2026-10-28T13:43:58Z", NOW, EN)), "Oct 28, 9:43 AM");
});

test("the year when it isn't this year", () => {
  assert.equal(plain(shortDateTime("2025-12-31T20:05:00Z", NOW, EN)), "Dec 31, 2025, 3:05 PM");
});

test("the year is judged in the same time zone as the date shown", () => {
  // 03:30 UTC on Jan 1 is still Dec 31 in New York: shown as last year's date, with its year.
  assert.equal(plain(shortDateTime("2026-01-01T03:30:00Z", new Date("2026-06-01T12:00:00Z"), EN)), "Dec 31, 2025, 10:30 PM");
});
