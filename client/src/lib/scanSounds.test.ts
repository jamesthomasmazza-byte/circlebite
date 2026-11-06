import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Verdict } from "./api";
import {
  readSoundPref,
  SOUND_PREF_KEY,
  soundForUpdate,
  soundsWanted,
  TONES,
  VERDICT_SOUND,
  writeSoundPref,
  type Tone,
} from "./scanSounds";

// Scan sounds (2026-11-05, BACKLOG item 11): the weaker claim is never the louder one, and a sound is
// never the only signal (docs/principles.md, Decision precedents, Nov 5).

const VERDICTS: Verdict[] = ["contains_allergen", "may_contain_caution", "safe", "unable_to_confirm"];
const ms = (t: Tone) => t.pulses * t.pulseMs + (t.pulses - 1) * t.gapMs;

test("Contains gets the alert, May contain the softer one, and the other two nothing", () => {
  assert.equal(VERDICT_SOUND.contains_allergen, "alert");
  assert.equal(VERDICT_SOUND.may_contain_caution, "caution");
  assert.equal(VERDICT_SOUND.safe, null, "no sound for 'No listed allergens found'");
  assert.equal(VERDICT_SOUND.unable_to_confirm, null, "no sound for 'Unable to confirm'");
});

test("the alert is louder than the caution on every measure: gain, pulses, length", () => {
  const { alert, caution } = TONES;
  assert.ok(alert.gain > caution.gain, "strictly louder");
  assert.ok(alert.pulses >= caution.pulses);
  assert.ok(ms(alert) >= ms(caution));
  assert.ok(alert.frequency > caution.frequency, "and higher");
});

test("the read beep is quieter than either warning and doesn't sound like one", () => {
  const { read, alert, caution } = TONES;
  assert.ok(read.gain < caution.gain && read.gain < alert.gain);
  assert.ok(ms(read) < ms(caution) && ms(read) < ms(alert));
  for (const w of [alert, caution]) assert.ok(read.wave !== w.wave && read.frequency !== w.frequency);
});

test("a card plays only something louder than what already played for its scan", () => {
  assert.equal(soundForUpdate(null, "contains_allergen"), "alert");
  assert.equal(soundForUpdate(null, "may_contain_caution"), "caution");
  assert.equal(soundForUpdate("caution", "contains_allergen"), "alert", "an escalation plays the louder sound then");
  assert.equal(soundForUpdate("alert", "may_contain_caution"), null, "a card that drops plays nothing");
  assert.equal(soundForUpdate("alert", "contains_allergen"), null, "the same verdict plays once");
  assert.equal(soundForUpdate("caution", "may_contain_caution"), null);
  for (const before of [null, "caution", "alert"] as const) {
    assert.equal(soundForUpdate(before, "safe"), null);
    assert.equal(soundForUpdate(before, "unable_to_confirm"), null);
  }
  for (const v of VERDICTS) assert.ok(soundForUpdate(null, v) === VERDICT_SOUND[v]);
});

test("the setting is on by default, off when chosen, and off when the browser can't read it", () => {
  const store = (value: string | null) => ({ getItem: (k: string) => (k === SOUND_PREF_KEY ? value : null) });
  assert.equal(readSoundPref(store(null)), true, "never chosen: on while the switch is on");
  assert.equal(readSoundPref(store("on")), true);
  assert.equal(readSoundPref(store("off")), false);
  assert.equal(readSoundPref(store("garbage")), false);
  assert.equal(readSoundPref(null), false, "no storage at all");
  assert.equal(readSoundPref({ getItem: () => { throw new Error("blocked"); } }), false, "storage that throws");
});

test("the server switch wins: off means no sound whatever the device says", () => {
  const on = { getItem: () => "on" };
  assert.equal(soundsWanted(false, on), false);
  assert.equal(soundsWanted(false, { getItem: () => null }), false);
  assert.equal(soundsWanted(true, on), true);
  assert.equal(soundsWanted(true, { getItem: () => "off" }), false);
});

test("writing the setting says whether the browser kept it", () => {
  const saved: Record<string, string> = {};
  assert.equal(writeSoundPref({ setItem: (k, v) => void (saved[k] = v) }, false), true);
  assert.equal(saved[SOUND_PREF_KEY], "off");
  assert.equal(writeSoundPref({ setItem: () => { throw new Error("quota"); } }, true), false);
  assert.equal(writeSoundPref(null, true), false);
});

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("generated in code: no audio files, no <audio>, no network", () => {
  // Code only: the file's comments explain why it isn't an <audio> element.
  const audio = src("../scanAudio.ts").replace(/\/\/.*$/gm, "");
  assert.match(audio, /createOscillator\(\)/);
  assert.doesNotMatch(audio, /new Audio\(|<audio|\.(mp3|wav|ogg|m4a)["'`]|fetch\(|https?:\/\//);
});

test("the verdict sound follows exactly what puts the card on screen", () => {
  const scan = src("../routes/Scan.tsx");
  assert.match(scan, /const cardVerdict = result && shown && !awaitingRequiredPhoto && !couldntReadLabel \? shown\.result : null;/);
  assert.match(scan, /\{result && shown && !awaitingRequiredPhoto && !couldntReadLabel && \(/, "the card's own condition");
  assert.match(scan, /soundForUpdate\(before, cardVerdict\)/);
  assert.match(scan, /if \(sound && soundsWanted\(scanSoundsEnabled, browserStorage\(\)\)\) playScanSound\(sound\);/);
});

test("the beep is at the read, beside the vibration, and only when sounds are wanted", () => {
  const scanner = src("../BarcodeScanner.tsx");
  assert.match(scanner, /navigator\.vibrate\?\.\(50\);\s*onReadRef\.current\?\.\(\);/);
  assert.match(src("../routes/Scan.tsx"), /onRead=\{\(\) => \{\s*if \(soundsWanted\(scanSoundsEnabled, browserStorage\(\)\)\) playScanSound\("read"\);/);
});

test("the setting is in Settings, after \"Your profiles\", and only with the switch on", () => {
  // JT, 2026-11-06: moved from Profile → Account unchanged. Its line stays beside the toggle, in
  // ScanSoundsSetting.tsx (ScanSoundsSetting.test.ts).
  const settings = src("../routes/Settings.tsx");
  const renames = settings.indexOf("<ProfileRenames");
  const sounds = settings.search(/\{scanSoundsEnabled && \(\s*<section>\s*<h2>Scan sounds<\/h2>\s*<ScanSoundsSetting \/>/);
  const password = settings.indexOf("<h2>Change your password</h2>");
  assert.ok(renames > 0 && sounds > renames && password > sounds);
  // The Account section keeps "Signed in as…", the Settings link and Log out, and nothing else.
  const profiles = src("../routes/Profiles.tsx");
  const account = profiles.slice(profiles.indexOf('section === "account"'));
  assert.doesNotMatch(profiles, /ScanSoundsSetting/);
  assert.match(account, /Signed in as \{user\?\.displayName\}[\s\S]*<Link to="\/settings">Settings<\/Link>[\s\S]*Log out/);
});
