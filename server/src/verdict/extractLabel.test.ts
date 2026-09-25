import assert from "node:assert/strict";
import { test } from "node:test";

import { extractLabel } from "./extractLabel.js";
import type { AiVisionClientResult } from "./types.js";

function fakeOk(overrides: Partial<Extract<AiVisionClientResult, { ok: true }>> = {}): () => Promise<AiVisionClientResult> {
  return async () => ({
    ok: true,
    ingredientsText: "Water, sugar, whey powder, soy lecithin.",
    productName: "Test Bar",
    contains: [],
    mayContain: [],
    legible: true,
    complete: true,
    incompleteReason: null,
    language: "en",
    latencyMs: 42,
    tokensIn: 500,
    tokensOut: 100,
    costCents: 0.1,
    ...overrides,
  });
}

const BUFFER = Buffer.from("fake-image-bytes");

test("under the spend cap and a successful call: extraction passes through, ok is true", async () => {
  const result = await extractLabel(BUFFER, "image/jpeg", {
    underDailySpendCap: async () => true,
    callAiVision: fakeOk(),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.ingredientsText, "Water, sugar, whey powder, soy lecithin.");
    assert.equal(result.legible, true);
    assert.equal(result.complete, true);
  }
});

test("legible: false is preserved as-is, not treated as a call failure", async () => {
  const result = await extractLabel(BUFFER, "image/jpeg", {
    underDailySpendCap: async () => true,
    callAiVision: fakeOk({ legible: false, ingredientsText: "" }),
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.legible, false);
});

test("legible: true, complete: false is preserved as-is — extractLabel doesn't collapse it into a failure or into legible: false", async () => {
  const result = await extractLabel(BUFFER, "image/jpeg", {
    underDailySpendCap: async () => true,
    callAiVision: fakeOk({ legible: true, complete: false, incompleteReason: "text continues past the right edge" }),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.legible, true);
    assert.equal(result.complete, false);
    assert.equal(result.incompleteReason, "text continues past the right edge");
  }
});

test("over the spend cap: fails closed without calling the vision client", async () => {
  let callAiVisionInvoked = false;
  const result = await extractLabel(BUFFER, "image/jpeg", {
    underDailySpendCap: async () => false,
    callAiVision: async () => {
      callAiVisionInvoked = true;
      return fakeOk()();
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failureReason, "spend_cap_exceeded");
  assert.equal(callAiVisionInvoked, false);
});

test("vision client failure (network/timeout/unparseable): fails closed, specific reason preserved", async () => {
  const result = await extractLabel(BUFFER, "image/jpeg", {
    underDailySpendCap: async () => true,
    callAiVision: async () => ({ ok: false, reason: "api_error_401" }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failureReason, "api_error_401");
});

test("carries model and prompt version through on both success and failure, for reproducibility", async () => {
  const success = await extractLabel(BUFFER, "image/jpeg", { underDailySpendCap: async () => true, callAiVision: fakeOk() });
  const failure = await extractLabel(BUFFER, "image/jpeg", { underDailySpendCap: async () => false, callAiVision: fakeOk() });

  assert.ok(success.model.length > 0);
  assert.ok(success.promptVersion.length > 0);
  assert.equal(failure.model, success.model);
  assert.equal(failure.promptVersion, success.promptVersion);
});
