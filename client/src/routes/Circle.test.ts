import assert from "node:assert/strict";
import { test } from "node:test";

import { circleOwnerLine } from "./Circle";

test("a circle you co-manage names its owner; your own circle doesn't name you", () => {
  const circle = { owner: { user_id: "sam", display_name: "Sam" } };
  assert.equal(circleOwnerLine(circle, "judge1"), "Sam — owner");
  assert.equal(circleOwnerLine(circle, "sam"), null);
  assert.equal(circleOwnerLine({ owner: null }, "judge1"), null);
});
