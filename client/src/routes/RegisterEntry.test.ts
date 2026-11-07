import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { REGISTRATION_CLOSED } from "../lib/registrationCopy";
import { RegistrationClosed } from "./RegisterEntry";

// /register with REGISTRATION off (2026-11-06, Prof. Yoest's Nov 5 ask): a plain line, no form.

const ENTRY = readFileSync(new URL("./RegisterEntry.tsx", import.meta.url), "utf8");

function render(path: string): string {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(RegistrationClosed)));
}

test("the closed line says only that new accounts are closed until after judging", () => {
  assert.equal(REGISTRATION_CLOSED, "New accounts are closed until after judging.");
});

test("closed: the line and a way to log in, and no form, field or link to sign up", () => {
  const html = render("/register");
  assert.match(html, new RegExp(REGISTRATION_CLOSED.replace(".", "\\.")));
  assert.doesNotMatch(html, /<form|<input|<button/);
  assert.doesNotMatch(html, /href="\/register/);
  assert.match(html, /<a href="\/login"[^>]*>Log in<\/a>/);
});

test("closed: an invite's returnTo is kept for signing in to an existing account", () => {
  const html = render(`/register?returnTo=${encodeURIComponent("/follow/abc")}`);
  assert.match(html, /<a href="\/login\?returnTo=%2Ffollow%2Fabc"[^>]*>Log in<\/a>/);
});

test("closed is chosen unless the server says sign-up is open, and when the switches can't be read", () => {
  assert.match(ENTRY, /f\.registrationOpen !== true \? "closed"/);
  assert.match(ENTRY, /\.catch\(\(\) => live && setChoice\("closed"\)\)/);
  assert.match(ENTRY, /if \(choice === "closed"\) return <RegistrationClosed \/>;/);
});
