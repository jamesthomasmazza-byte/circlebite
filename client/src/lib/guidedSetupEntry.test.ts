import assert from "node:assert/strict";
import { test } from "node:test";

import { guidedSetupSkipped, markGuidedSetupSkipped, sendToGuidedSetup, setupArrival, skippedKey } from "./guidedSetupEntry";

// Who goes to the guided setup on first visit, and "Skip for now" (2026-10-27).

const BASE = { enabled: true, profilesLoaded: true, ownedOrManaged: 0, followed: 0, skipped: false };

test("only with the switch on, a list that loaded, no profiles owned or followed, and not skipped", () => {
  assert.equal(sendToGuidedSetup(BASE), true);
  assert.equal(sendToGuidedSetup({ ...BASE, enabled: false }), false);
  assert.equal(sendToGuidedSetup({ ...BASE, profilesLoaded: false }), false, "a failed load isn't an empty account");
  assert.equal(sendToGuidedSetup({ ...BASE, ownedOrManaged: 1 }), false);
  assert.equal(sendToGuidedSetup({ ...BASE, followed: 1 }), false, "someone who follows a profile isn't pushed");
  assert.equal(sendToGuidedSetup({ ...BASE, skipped: true }), false);
});

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

test("Skip is kept per account; unreadable storage means no redirect, never a loop", () => {
  const storage = memory();
  assert.equal(guidedSetupSkipped("u1", storage), false);
  markGuidedSetupSkipped("u1", storage);
  assert.equal(storage.data.get(skippedKey("u1")), "1");
  assert.equal(guidedSetupSkipped("u1", storage), true);
  assert.equal(guidedSetupSkipped("u2", storage), false, "another account on this browser");
  assert.equal(guidedSetupSkipped("u1", broken), true);
  assert.equal(guidedSetupSkipped("u1", null), true);
  assert.doesNotThrow(() => markGuidedSetupSkipped("u1", broken));
});

test("how the setup was reached", () => {
  assert.equal(setupArrival("?from=signup"), "signup");
  assert.equal(setupArrival("?from=landing"), "landing");
  assert.equal(setupArrival(""), null);
  assert.equal(setupArrival("?from=elsewhere"), null);
});
