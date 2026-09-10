import assert from "node:assert/strict";
import { test } from "node:test";

import { reasonVerdict } from "./reasonVerdict.js";
import type { AiClientResult } from "./types.js";

const INPUT = {
  allergens: [{ name: "Milk", severity: "severe" as const, treatTracesAsUnsafe: true }],
  ingredientsText: "Water, sugar, whey powder, soy lecithin.",
  deterministicHits: [],
};

function fakeOk(overrides: Partial<Extract<AiClientResult, { ok: true }>> = {}): () => Promise<AiClientResult> {
  return async () => ({
    ok: true,
    findings: [],
    unresolvedTerms: [],
    latencyMs: 42,
    tokensIn: 100,
    tokensOut: 20,
    costCents: 0.02,
    ...overrides,
  });
}

test("under the spend cap and a successful call: findings pass through, failed is false", async () => {
  const result = await reasonVerdict(INPUT, {
    underDailySpendCap: async () => true,
    callAi: fakeOk({
      findings: [
        { allergen: "Milk", present: "yes", citedSpan: "whey powder", reason: "whey is a milk derivative", confidence: "medium" },
      ],
    }),
  });

  assert.equal(result.failed, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].present, "yes");
  assert.equal(result.findings[0].citedSpan, "whey powder");
});

test("over the spend cap: fails closed without calling the AI client", async () => {
  let callAiInvoked = false;
  const result = await reasonVerdict(INPUT, {
    underDailySpendCap: async () => false,
    callAi: async () => {
      callAiInvoked = true;
      return { ok: true, findings: [], unresolvedTerms: [], latencyMs: 1, tokensIn: 1, tokensOut: 1, costCents: 0 };
    },
  });

  assert.equal(result.failed, true);
  assert.equal(result.failureReason, "spend_cap_exceeded");
  assert.equal(result.findings.length, 0);
  assert.equal(callAiInvoked, false);
});

test("AI client failure (network/timeout/unparseable): fails closed", async () => {
  const result = await reasonVerdict(INPUT, {
    underDailySpendCap: async () => true,
    callAi: async () => ({ ok: false, reason: "request_failed" }),
  });

  assert.equal(result.failed, true);
  assert.equal(result.findings.length, 0);
  assert.equal(result.unresolvedTerms.length, 0);
});

test("the AI client's specific failure reason is preserved, not collapsed into a generic one", async () => {
  // This exact behavior was missing in production: aiClient.ts's own reason (e.g. which API status
  // code came back) needs to survive up through reasonVerdict.ts and into what gets stored,
  // otherwise a real failure and a spend-cap refusal are indistinguishable after the fact.
  const result = await reasonVerdict(INPUT, {
    underDailySpendCap: async () => true,
    callAi: async () => ({ ok: false, reason: "api_error_401" }),
  });

  assert.equal(result.failureReason, "api_error_401");
});

test("failureReason is null on a successful call", async () => {
  const result = await reasonVerdict(INPUT, { underDailySpendCap: async () => true, callAi: fakeOk() });
  assert.equal(result.failureReason, null);
});

test("a 'yes' finding whose citedSpan doesn't verbatim-match the source is downgraded to unknown, not dropped", async () => {
  const result = await reasonVerdict(INPUT, {
    underDailySpendCap: async () => true,
    callAi: fakeOk({
      findings: [
        { allergen: "Milk", present: "yes", citedSpan: "contains dairy", reason: "hallucinated paraphrase", confidence: "medium" },
      ],
    }),
  });

  assert.equal(result.failed, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].present, "unknown");
  assert.equal(result.findings[0].citedSpan, "");
});

test("a 'trace' finding with a valid span passes through unchanged", async () => {
  const result = await reasonVerdict(INPUT, {
    underDailySpendCap: async () => true,
    callAi: fakeOk({
      findings: [
        { allergen: "Soy", present: "trace", citedSpan: "soy lecithin", reason: "explicit ingredient", confidence: "medium" },
      ],
    }),
  });

  assert.equal(result.findings[0].present, "trace");
  assert.equal(result.findings[0].citedSpan, "soy lecithin");
});

test("'no' and 'unknown' findings are never span-checked, even with an empty citedSpan", async () => {
  const result = await reasonVerdict(INPUT, {
    underDailySpendCap: async () => true,
    callAi: fakeOk({
      findings: [
        { allergen: "Peanut", present: "no", citedSpan: "", reason: "not mentioned", confidence: "medium" },
        { allergen: "Egg", present: "unknown", citedSpan: "", reason: "ambiguous additive code", confidence: "low" },
      ],
    }),
  });

  assert.equal(result.findings[0].present, "no");
  assert.equal(result.findings[1].present, "unknown");
});

test("carries model and prompt version through on both success and failure, for reproducibility", async () => {
  const success = await reasonVerdict(INPUT, { underDailySpendCap: async () => true, callAi: fakeOk() });
  const failure = await reasonVerdict(INPUT, { underDailySpendCap: async () => false, callAi: fakeOk() });

  assert.ok(success.model.length > 0);
  assert.ok(success.promptVersion.length > 0);
  assert.equal(failure.model, success.model);
  assert.equal(failure.promptVersion, success.promptVersion);
});
