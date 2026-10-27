import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ShellHeader } from "./TabShell";

const SHELL = readFileSync(new URL("./TabShell.tsx", import.meta.url), "utf8");

function render(label: string | null): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(ShellHeader, { scanningFor: label })),
  );
}

test("the header names the profile Scan checks for, and links to Scan", () => {
  const html = render("Maya");
  assert.match(html, /CircleBite/);
  assert.match(html, /Scanning for: <strong>Maya<\/strong>/);
  assert.match(html, /href="\/scan"/);
});

test("the header carries the same-name suffix it's given", () => {
  assert.match(render("Maya (you follow)"), /Scanning for: <strong>Maya \(you follow\)<\/strong>/);
});

test("with no profile yet, the header is the wordmark alone", () => {
  const html = render(null);
  assert.match(html, /CircleBite/);
  assert.doesNotMatch(html, /Scanning for/);
});

// Condition 2: the notice stays on the landing screen. The header is the only thing above it, and
// the page comes after both.
test("the header renders first, then Condition 2's notices, then the page", () => {
  const header = SHELL.indexOf("<ShellHeader");
  const notices = SHELL.indexOf("<LandingNotices");
  const page = SHELL.indexOf("<Outlet");
  assert.ok(header > 0 && header < notices && notices < page);
});

test("Scan gets the slim notices and the Profile tab the full ones (Condition 2, 2026-10-26)", () => {
  assert.match(SHELL, /<LandingNotices \{\.\.\.notices\} slim=\{current === "scan"\} \/>/);
});
