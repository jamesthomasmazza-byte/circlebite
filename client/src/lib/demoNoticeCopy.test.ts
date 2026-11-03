import assert from "node:assert/strict";
import { test } from "node:test";

import { DEMO_NOTICE } from "./demoNoticeCopy";

test("the demo notice asks for a made-up name and a test email, and says nothing about age or birth dates", () => {
  assert.match(DEMO_NOTICE, /made-up name/);
  assert.match(DEMO_NOTICE, /test email/);
  // docs/coppa.md §2.1: nothing that hints which age passes, and nothing that invites a made-up date.
  assert.doesNotMatch(DEMO_NOTICE, /\badults?\b|\b18\b|grown-ups?|old enough|\bage\b|birth|date/i);
});
