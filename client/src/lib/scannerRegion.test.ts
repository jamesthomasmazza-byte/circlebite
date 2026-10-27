import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boxToFrame,
  parseOverride,
  REGION_ALLOWANCE,
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

// The box mapped onto the camera's frame, through object-fit: cover. The box is inset 30% 10% of
// the preview, as styles.css draws it.

function insetBox(video: { x: number; y: number; width: number; height: number }) {
  return { x: video.x + video.width * 0.1, y: video.y + video.height * 0.3, width: video.width * 0.8, height: video.height * 0.4 };
}

test("the allowance is 5% beyond the box on every side", () => {
  assert.equal(REGION_ALLOWANCE, 0.05);
});

test("portrait preview of a landscape frame: the sides are cut off, and the box maps inside them", () => {
  // 1200×800 scaled by 0.5 to 600×400 covers a 300×400 preview; 150 px is cut from each side.
  const video = { x: 0, y: 0, width: 300, height: 400 };
  assert.deepEqual(boxToFrame(video, insetBox(video), { width: 1200, height: 800 }, 0), { x: 360, y: 240, width: 480, height: 320 });
  // Wherever the preview sits on the page.
  const moved = { x: 16, y: 120, width: 300, height: 400 };
  assert.deepEqual(boxToFrame(moved, insetBox(moved), { width: 1200, height: 800 }, 0), { x: 360, y: 240, width: 480, height: 320 });
});

test("the allowance widens the box by 5% of its width and height on every side", () => {
  const video = { x: 0, y: 0, width: 300, height: 400 };
  // The box is 240×160 on screen: 12 px and 8 px more each side, 24 and 16 frame pixels at 0.5.
  assert.deepEqual(boxToFrame(video, insetBox(video), { width: 1200, height: 800 }), { x: 336, y: 224, width: 528, height: 352 });
});

test("portrait preview of a portrait frame (as iOS sends it): top and bottom are cut off", () => {
  // 800×1200 scaled by 0.375 to 300×450 covers 300×400; 25 px is cut from top and bottom.
  const video = { x: 0, y: 0, width: 300, height: 400 };
  assert.deepEqual(boxToFrame(video, insetBox(video), { width: 800, height: 1200 }, 0), { x: 80, y: 386, width: 640, height: 428 });
});

test("landscape preview the frame's shape: nothing is cut off", () => {
  const video = { x: 0, y: 0, width: 400, height: 225 };
  assert.deepEqual(boxToFrame(video, insetBox(video), { width: 1280, height: 720 }, 0), { x: 128, y: 216, width: 1024, height: 288 });
});

test("landscape preview wider than the frame: top and bottom are cut off", () => {
  // 1280×720 scaled by 0.3125 to 400×225 covers 400×200; 12.5 px is cut from top and bottom.
  const video = { x: 0, y: 0, width: 400, height: 200 };
  assert.deepEqual(boxToFrame(video, insetBox(video), { width: 1280, height: 720 }, 0), { x: 128, y: 232, width: 1024, height: 256 });
});

test("a box reaching past the frame is kept inside it", () => {
  const video = { x: 0, y: 0, width: 400, height: 225 };
  const wide = { x: -20, y: 50, width: 460, height: 100 };
  assert.deepEqual(boxToFrame(video, wide, { width: 1280, height: 720 }), { x: 0, y: 144, width: 1280, height: 352 });
});

test("nothing measurable yet, or a box off the frame, gives no region", () => {
  const video = { x: 0, y: 0, width: 400, height: 225 };
  const box = insetBox(video);
  assert.equal(boxToFrame({ ...video, width: 0 }, box, { width: 1280, height: 720 }), null);
  assert.equal(boxToFrame(video, box, { width: 0, height: 0 }), null);
  assert.equal(boxToFrame(video, { ...box, height: 0 }, { width: 1280, height: 720 }), null);
  assert.equal(boxToFrame(video, { x: 500, y: 0, width: 50, height: 50 }, { width: 1280, height: 720 }), null);
});
