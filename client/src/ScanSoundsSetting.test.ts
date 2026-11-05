import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SOUND_PREF_KEY } from "./lib/scanSounds";
import { ScanSoundsSetting } from "./ScanSoundsSetting";

// The Account toggle (2026-11-05): on by default, JT's line under it, and honest when the browser
// can't keep the choice.

function storage(value: string | null): Storage {
  return { getItem: (k: string) => (k === SOUND_PREF_KEY ? value : null) } as unknown as Storage;
}

const render = (s: Storage | null) => renderToStaticMarkup(createElement(ScanSoundsSetting, { storage: s }));

test("never chosen: checked, with the line that silence isn't a clean bill", () => {
  const html = render(storage(null));
  assert.match(html, /<input type="checkbox" checked=""\/>Scan sounds on this device/);
  assert.match(html, /A sound marks a warning\. No sound never means it&#x27;s fine\. Read the card\./);
  assert.doesNotMatch(html, /can&#x27;t keep the choice/);
});

test("turned off on this device: unchecked", () => {
  assert.match(render(storage("off")), /<input type="checkbox"\/>Scan sounds/);
});

test("no storage: off, disabled, and it says why", () => {
  const html = render(null);
  assert.match(html, /<input type="checkbox" disabled=""\/>/);
  assert.match(html, /role="status">This browser can&#x27;t keep the choice, so sounds stay off here\./);
});
