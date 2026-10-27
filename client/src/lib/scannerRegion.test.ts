import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseOverride,
  readOverride,
  REGION_OVERRIDE_KEY,
  regionStatus,
  saveOverride,
  scannerRegionOn,
} from "./scannerRegion";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

test("with no override, the server decides: off or unset is the whole frame", () => {
  for (const isAdmin of [false, true]) {
    assert.equal(scannerRegionOn(false, isAdmin, "server"), false);
    assert.equal(scannerRegionOn(true, isAdmin, "server"), true);
  }
});

test("an override is ignored for anyone who isn't an admin", () => {
  assert.equal(scannerRegionOn(false, false, "on"), false);
  assert.equal(scannerRegionOn(true, false, "off"), true);
});

test("for an admin, On and Off both win over the server", () => {
  assert.equal(scannerRegionOn(false, true, "on"), true);
  assert.equal(scannerRegionOn(true, true, "off"), false);
});

test("anything stored but on or off reads as the server default", () => {
  assert.equal(parseOverride("on"), "on");
  assert.equal(parseOverride("off"), "off");
  for (const raw of [null, undefined, "", "ON", "true", "server"]) assert.equal(parseOverride(raw), "server");
});

test("the choice is kept on this device, and Server default clears it", () => {
  const storage = memoryStorage();
  assert.equal(saveOverride("on", storage), true);
  assert.equal(storage.data.get(REGION_OVERRIDE_KEY), "on");
  assert.equal(readOverride(storage), "on");
  assert.equal(saveOverride("server", storage), true);
  assert.equal(storage.data.has(REGION_OVERRIDE_KEY), false);
  assert.equal(readOverride(storage), "server");
});

test("without usable storage (private mode, blocked) it's the server default, and saving says so", () => {
  assert.equal(readOverride(null), "server");
  assert.equal(readOverride(throwing), "server");
  assert.equal(saveOverride("on", null), false);
  assert.equal(saveOverride("on", throwing), false);
});

test("the Admin section says what's in effect and where it comes from", () => {
  assert.equal(regionStatus(false, true, "server"), "Whole frame (server)");
  assert.equal(regionStatus(true, true, "server"), "Inside the box (server)");
  assert.equal(regionStatus(false, true, "on"), "Inside the box (this device)");
  assert.equal(regionStatus(true, true, "off"), "Whole frame (this device)");
});

test("the device choice is in the Admin section only, which shows only for an admin", async () => {
  const { readFileSync } = await import("node:fs");
  const profiles = readFileSync(new URL("../routes/Profiles.tsx", import.meta.url), "utf8");
  const admin = profiles.slice(profiles.indexOf('{section === "admin" && ('), profiles.indexOf('{section === "account" && ('));
  assert.match(admin, /Decode only inside the box, this device/);
  assert.equal(profiles.match(/saveOverride\(/g)?.length, 1);
  assert.ok(profiles.indexOf("saveOverride(") > profiles.indexOf('{section === "admin" && ('));
  assert.ok(profiles.indexOf("saveOverride(") < profiles.indexOf('{section === "account" && ('));
});
