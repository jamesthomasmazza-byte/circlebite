import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProfileRenames } from "./ProfileRenames";
import { ApiRequestError, type ProfileSummary } from "./lib/api";
import { renameableProfiles, renameErrorCopy, saveRename } from "./lib/profileRenameCopy";

// Settings → "Your profiles" (JT, 2026-11-05): renaming moved here from the profile page. One row per
// profile the user owns or co-manages; never one a follower holds.

const MAYA: ProfileSummary = { id: "p1", label: "Maya", is_self: false, relationship: "owner", allergen_names: ["Peanut"] };
const LEO: ProfileSummary = { id: "p2", label: "Leo", is_self: false, relationship: "co_manager", allergen_names: [] };
const FOLLOWED: ProfileSummary = { id: "p3", label: "Ava", is_self: false, share_level: "all", allergen_names: ["Milk"] };

const noRename = async () => ({ label: "" });

function render(managed: ProfileSummary[]): string {
  return renderToStaticMarkup(createElement(ProfileRenames, { list: { managed }, onRename: noRename }));
}

test("a manager gets a 'Profile name' field and Save for each profile they own or co-manage", () => {
  const html = render([MAYA, LEO]);
  assert.match(html, /<h2>Your profiles<\/h2>/);
  for (const name of ["Maya", "Leo"]) {
    assert.match(html, new RegExp(`<form aria-label="Rename ${name}">`));
    assert.match(html, new RegExp(`<label>Profile name<input required="" value="${name}"/></label>`));
  }
  assert.equal(html.match(/<button type="submit">Save<\/button>/g)?.length, 2);
});

test("a follower sees no row: only managed profiles are listed, and none hides the section", () => {
  assert.deepEqual(renameableProfiles({ managed: [MAYA, LEO] }).map((p) => p.id), ["p1", "p2"]);
  // A followed profile carries no owner/co-manager relationship, so it can't become a row.
  assert.deepEqual(renameableProfiles({ managed: [FOLLOWED] }), []);
  assert.equal(render([]), "");
  assert.equal(render([FOLLOWED]), "");
});

test("Save sends the name for that profile and returns what the server saved", async () => {
  const calls: unknown[] = [];
  const result = await saveRename("p1", "  Maya R  ", async (id, input) => {
    calls.push([id, input]);
    return { label: input.label.trim() };
  });
  assert.deepEqual(calls, [["p1", { label: "  Maya R  " }]]);
  assert.deepEqual(result, { label: "Maya R", error: null });
});

test("a failed save comes back as that row's error, never a throw", async () => {
  const fail = (err: unknown) => async () => {
    throw err;
  };
  assert.deepEqual(await saveRename("p1", " ", fail(new ApiRequestError("invalid_request", 400))), {
    label: null,
    error: "Enter a name for this profile.",
  });
  assert.equal(
    (await saveRename("p1", "Maya", fail(new ApiRequestError("not_found", 404)))).error,
    renameErrorCopy(new ApiRequestError("not_found", 404)),
  );
  assert.equal((await saveRename("p1", "Maya", fail(new TypeError("offline")))).error, "Couldn't save. Try again.");
});
