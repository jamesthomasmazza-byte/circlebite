import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CAMERA_PRIMER_KEY, cameraPrimerSeen, markCameraPrimerSeen } from "./cameraPrimer";

const SCANNER = readFileSync(new URL("../BarcodeScanner.tsx", import.meta.url), "utf8");

// The one sentence before a device's first camera use (2026-10-27).

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
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

test("the camera sentence shows until it's been seen on this device; broken storage shows it again", () => {
  const storage = memory();
  assert.equal(cameraPrimerSeen(storage), false);
  markCameraPrimerSeen(storage);
  assert.equal(storage.data.get(CAMERA_PRIMER_KEY), "1");
  assert.equal(cameraPrimerSeen(storage), true);
  assert.equal(cameraPrimerSeen(broken), false);
  assert.doesNotThrow(() => markCameraPrimerSeen(broken));
  assert.equal(cameraPrimerSeen(null), false);
});

test("the first tap shows the sentence instead of starting the camera; Continue starts it", () => {
  assert.match(SCANNER, /onClick=\{\(\) => \(cameraPrimerSeen\(\) \? void startCamera\(\) : setPrimerOpen\(true\)\)\}/);
  assert.match(SCANNER, /markCameraPrimerSeen\(\);\s*setPrimerOpen\(false\);\s*void startCamera\(\);/);
  const start = SCANNER.slice(SCANNER.indexOf("  async function startCamera()"), SCANNER.indexOf("\n  }\n", SCANNER.indexOf("  async function startCamera()")));
  assert.doesNotMatch(start, /primer|Primer/, "the camera code itself is unchanged");
});
