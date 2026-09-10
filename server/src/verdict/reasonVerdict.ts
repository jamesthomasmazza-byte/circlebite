import { env } from "../env.js";
import { callAi as defaultCallAi } from "./aiClient.js";
import { PROMPT_VERSION, type PromptInput } from "./prompt.js";
import { validateSpan } from "./spanValidator.js";
import { underDailySpendCap as defaultUnderDailySpendCap } from "./spendGuard.js";
import type { AiFinding, ReasonVerdictResult } from "./types.js";

export type ReasonVerdictDeps = {
  callAi?: typeof defaultCallAi;
  underDailySpendCap?: typeof defaultUnderDailySpendCap;
};

/**
 * Safety rule 3: an unverifiable positive claim is discarded before it can assert "contains" or
 * "trace" for an allergen — but it still represents real model uncertainty near that allergen, not
 * silence, so it becomes present: "unknown" rather than being dropped outright. mergeVerdict.ts
 * then treats "unknown" as unresolved, never as a clean "clear" (see its own comments for why).
 * "no"/"unknown" findings carry no positive claim, so they pass through unvalidated.
 */
function discardUnverifiableClaims(findings: AiFinding[], ingredientsText: string): AiFinding[] {
  return findings.map((finding) => {
    if (finding.present !== "yes" && finding.present !== "trace") return finding;
    if (validateSpan(finding.citedSpan, ingredientsText)) return finding;
    return { ...finding, present: "unknown", citedSpan: "" };
  });
}

function failedResult(): ReasonVerdictResult {
  return {
    findings: [],
    unresolvedTerms: [],
    failed: true,
    model: env.aiModel,
    promptVersion: PROMPT_VERSION,
    latencyMs: 0,
    tokensIn: null,
    tokensOut: null,
    costCents: null,
  };
}

/**
 * Orchestrates one Path B AI reasoning pass: spend cap check -> model call -> span validation.
 * Never throws. `failed: true` is the one signal callers need to fail closed on (safety rule 1) —
 * it is never conflated with "the call succeeded and simply found nothing."
 */
export async function reasonVerdict(input: PromptInput, deps: ReasonVerdictDeps = {}): Promise<ReasonVerdictResult> {
  const callAi = deps.callAi ?? defaultCallAi;
  const underDailySpendCap = deps.underDailySpendCap ?? defaultUnderDailySpendCap;

  if (!(await underDailySpendCap())) return failedResult();

  const result = await callAi(input);
  if (!result.ok) return failedResult();

  return {
    findings: discardUnverifiableClaims(result.findings, input.ingredientsText),
    unresolvedTerms: result.unresolvedTerms,
    failed: false,
    model: env.aiModel,
    promptVersion: PROMPT_VERSION,
    latencyMs: result.latencyMs,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costCents: result.costCents,
  };
}
