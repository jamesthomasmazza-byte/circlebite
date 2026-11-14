import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Scan opening a tapped snack search result (SnackSearch.tsx, lib/snackSearch.ts; the plan's Nov 14
// addendum). Source-level, like ScanRedesign.test.ts: the barcode comes from location state, never
// the URL, and runs the same typed-barcode scan as the form.
const SOURCE = readFileSync(new URL("./Scan.tsx", import.meta.url), "utf8");

test("the barcode is read from location state with pickedBarcode, only with SNACK_SEARCH on and for the requested profile", () => {
  assert.match(SOURCE, /const \{ search, state: navState \} = useLocation\(\);/);
  assert.match(SOURCE, /const picked = pickedBarcode\(navState\);/);
  assert.match(SOURCE, /if \(snackSearchStarted\.current \|\| loadingProfiles \|\| !snackSearchEnabled\) return;/);
  assert.doesNotMatch(SOURCE, /searchParams\.get\("barcode"\)|get\("code"\)/, "a barcode is never read from the URL");
});

test("it runs the existing typed scan, shows the barcode in the Type it form, and clears the state so Back or a reload doesn't scan again", () => {
  const effect = SOURCE.slice(SOURCE.indexOf("const picked = pickedBarcode(navState);"), SOURCE.indexOf("}, [navState, search, loadingProfiles, profileId, snackSearchEnabled]);"));
  assert.match(effect, /navigate\(`\/scan\?profile=\$\{profileId\}`, \{ replace: true, state: null \}\);/);
  assert.match(effect, /setMode\("type"\);/);
  assert.match(effect, /setBarcode\(picked\);/);
  assert.match(effect, /void runScan\(picked, profileId\);/);
  assert.match(effect, /snackSearchStarted\.current = false;/, "a later pick, after the state was cleared, runs again");
});
