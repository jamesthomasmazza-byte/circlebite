import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The first-visit redirect to the guided setup (2026-10-27, lib/guidedSetupEntry.ts).

const SCAN = readFileSync(new URL("./Scan.tsx", import.meta.url), "utf8");

test("Scan sends a first visit with no profiles to the setup, only once the list has loaded", () => {
  assert.match(SCAN, /profilesLoaded,\s*ownedOrManaged: managedProfiles\.length,\s*followed: profiles\.length - managedProfiles\.length,/);
  assert.match(SCAN, /navigate\(`\$\{NEW_PROFILE_PATH\}\?from=landing`, \{ replace: true \}\);/);
  assert.match(SCAN, /setManagedProfiles\(res\.managed\);\s*setProfilesLoaded\(true\);/);
});
