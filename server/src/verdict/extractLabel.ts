import { env } from "../env.js";
import { callAiVision as defaultCallAiVision } from "./aiClient.js";
import { EXTRACT_PROMPT_VERSION } from "./prompt.js";
import { underDailySpendCap as defaultUnderDailySpendCap } from "./spendGuard.js";
import type { ExtractLabelResult } from "./types.js";

export type ExtractLabelDeps = {
  callAiVision?: typeof defaultCallAiVision;
  underDailySpendCap?: typeof defaultUnderDailySpendCap;
};

function failedResult(reason: string): ExtractLabelResult {
  return { ok: false, failureReason: reason, model: env.aiModel, promptVersion: EXTRACT_PROMPT_VERSION };
}

/**
 * Orchestrates Path C's extraction call: spend cap check -> vision model call. Mirrors
 * reasonVerdict.ts's own shape deliberately — one shared daily spend cap across both call types
 * (spendGuard.ts's underDailySpendCap sums cost_cents across verdict_explanations AND
 * label_extractions), and the same "never throws, ok: false is the one signal callers fail closed
 * on" discipline. No span validation here — that only applies to reasonVerdict's allergen findings;
 * this call transcribes, it doesn't make any allergen claim to validate. legible/complete are
 * passed straight through, unexamined — the route decides what to do with an incomplete or
 * illegible read (docs/verdict-engine.md Path C plan: both route the same way, straight to
 * unable_to_confirm, before reasonVerdict is ever called).
 */
export async function extractLabel(
  imageBuffer: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  deps: ExtractLabelDeps = {},
): Promise<ExtractLabelResult> {
  const callAiVision = deps.callAiVision ?? defaultCallAiVision;
  const underDailySpendCap = deps.underDailySpendCap ?? defaultUnderDailySpendCap;

  if (!(await underDailySpendCap())) return failedResult("spend_cap_exceeded");

  const result = await callAiVision(imageBuffer, mimeType);
  if (!result.ok) return failedResult(result.reason);

  return {
    ok: true,
    ingredientsText: result.ingredientsText,
    productName: result.productName,
    contains: result.contains,
    mayContain: result.mayContain,
    legible: result.legible,
    complete: result.complete,
    incompleteReason: result.incompleteReason,
    language: result.language,
    model: env.aiModel,
    promptVersion: EXTRACT_PROMPT_VERSION,
    latencyMs: result.latencyMs,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costCents: result.costCents,
  };
}
