import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { REGISTER_ERROR_COPY } from "../lib/guidedRegister";

// The guided sign-up's page and the entry that picks it (2026-10-27).

const GUIDED = readFileSync(new URL("./GuidedRegister.tsx", import.meta.url), "utf8");
const ENTRY = readFileSync(new URL("./RegisterEntry.tsx", import.meta.url), "utf8");
const CLASSIC = readFileSync(new URL("./Register.tsx", import.meta.url), "utf8");
const MAIN = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const SETUP = readFileSync(new URL("./NewProfile.tsx", import.meta.url), "utf8");

const text = (source: string) => source.replace(/\s+/g, " ");

test("switch off is today's page exactly: Register.tsx untouched, and chosen unless the flag says on", () => {
  assert.equal(createHash("sha256").update(CLASSIC).digest("hex"), "cc0f0b32d6542c5956ea6803997104b0000c21b326c1b8c1209a77288c889238");
  assert.match(MAIN, /<Route path="\/register" element=\{<RegisterEntry \/>\} \/>/);
  assert.match(ENTRY, /\.then\(\(f\) => live && setGuided\(f\.guidedSetupEnabled === true\)\)\s*\.catch\(\(\) => live && setGuided\(false\)\)/);
  assert.match(ENTRY, /if \(guided === null\) return null;\s*return guided \? <GuidedRegister \/> : <Register \/>;/);
});

test("the same request: register() once, with the same four fields", () => {
  assert.equal(GUIDED.match(/register\(/g)?.length, 1);
  assert.match(GUIDED, /await register\(registerPayload\(answers\)\);/);
});

test("the same errors in the same words, each on its own step", () => {
  for (const words of Object.values(REGISTER_ERROR_COPY)) assert.ok(CLASSIC.includes(words), words);
  assert.match(GUIDED, /const where = errorStep\(code, answers\);/);
  assert.match(GUIDED, /setStep\(where\);/);
});

test("the under-18 refusal is Register.tsx's, word for word, with no 'try again'", () => {
  const refusal = (source: string) => {
    const i = source.indexOf("CircleBite is for grown-ups");
    return text(source.slice(i, source.indexOf("</p>", i)).replace(/<h1[^>]*>|<\/h1>|<p>/g, ""));
  };
  assert.equal(refusal(GUIDED), refusal(CLASSIC));
  const block = GUIDED.slice(GUIDED.indexOf("if (blocked) {"), GUIDED.indexOf("const ready ="));
  assert.doesNotMatch(block, /try again|<button/i);
});

test("the date step is today's 'Date of birth', and nothing before it says 18", () => {
  assert.match(GUIDED, /dob: "Date of birth",/);
  const beforeRefusal = GUIDED.slice(0, GUIDED.indexOf("if (blocked) {")) + GUIDED.slice(GUIDED.indexOf("const ready ="));
  // Comments and the Back icon's width="18" aside: nothing a person reads.
  const visible = beforeRefusal.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "").replace(/(width|height)="18"/g, "");
  assert.doesNotMatch(visible, /\b18\b|adult/i);
});

test("today's intro line and Log in (with returnTo) on the first step", () => {
  assert.ok(text(CLASSIC).includes("Your account is yours to manage — you can add a profile for someone in your care after signing up."));
  assert.ok(text(GUIDED).includes("Your account is yours to manage — you can add a profile for someone in your care after signing up."));
  assert.match(GUIDED, /Already have an account\? <Link to=\{login\}>Log in<\/Link>/);
  assert.match(GUIDED, /const login = `\/login\$\{returnTo \? `\?returnTo=\$\{encodeURIComponent\(returnTo\)\}` : ""\}`;/);
});

test("after sign-up: an invite's returnTo first, else the guided setup", () => {
  assert.match(GUIDED, /navigate\(returnTo \? safeReturnTo\(returnTo\) : `\$\{NEW_PROFILE_PATH\}\?from=signup`\);/);
});

test("from sign-up or a first visit the setup offers Skip for now and carries the progress on", () => {
  assert.match(SETUP, /const arrival = setupArrival\(useLocation\(\)\.search\);/);
  assert.match(SETUP, /arrival === "signup" \? signupSetupProgress\(percent\) : percent/);
  assert.match(SETUP, /markGuidedSetupSkipped\(user\.id\);\s*navigate\(LANDING_PATH\);/);
});
