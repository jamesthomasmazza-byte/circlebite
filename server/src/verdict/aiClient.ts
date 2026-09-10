import Anthropic, { APIError } from "@anthropic-ai/sdk";

import { env } from "../env.js";
import { buildUserPrompt, SYSTEM_PROMPT, type PromptInput } from "./prompt.js";
import type { AiClientResult, AiFinding } from "./types.js";

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 1024;
const TOOL_NAME = "report_allergen_findings";

// Claude Haiku 4.5 pricing, confirmed against platform.claude.com/docs/en/about-claude/pricing on
// 2026-09-10: $1/MTok input, $5/MTok output. In cents-per-token so cost_cents stays a small,
// storage-friendly number end to end. Re-check this if AI_MODEL is ever changed to a different
// model — it's not derived from the API response.
const INPUT_CENTS_PER_TOKEN = 100 / 1_000_000;
const OUTPUT_CENTS_PER_TOKEN = 500 / 1_000_000;

// Exported so tests can walk the actual schema sent to the API — see aiClient.test.ts. This is
// the object that broke every Path B scan in production for as long as this tool existed:
// strict: true requires additionalProperties: false on EVERY object node in input_schema, not
// just the root, and the API rejects the whole request (400, before any inference happens) if
// even one is missing. The two object nodes below (the root and findings.items) both need it.
export const FINDINGS_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Report structured allergen findings for the given ingredient text.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            allergen: { type: "string" },
            present: { type: "string", enum: ["yes", "trace", "no", "unknown"] },
            citedSpan: {
              type: "string",
              description:
                "The exact verbatim substring of the ingredient text supporting this finding. Empty string if present is 'no' or 'unknown'.",
            },
            reason: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["allergen", "present", "citedSpan", "reason", "confidence"],
          additionalProperties: false,
        },
      },
      unresolvedTerms: { type: "array", items: { type: "string" } },
    },
    required: ["findings", "unresolvedTerms"],
    additionalProperties: false,
  },
};

function isFinding(value: unknown): value is AiFinding {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.allergen === "string" &&
    (v.present === "yes" || v.present === "trace" || v.present === "no" || v.present === "unknown") &&
    typeof v.citedSpan === "string" &&
    typeof v.reason === "string" &&
    (v.confidence === "high" || v.confidence === "medium" || v.confidence === "low")
  );
}

function parseToolInput(input: unknown): { findings: AiFinding[]; unresolvedTerms: string[] } | null {
  if (typeof input !== "object" || input === null) return null;
  const v = input as Record<string, unknown>;
  if (!Array.isArray(v.findings) || !v.findings.every(isFinding)) return null;
  if (!Array.isArray(v.unresolvedTerms) || !v.unresolvedTerms.every((t) => typeof t === "string")) return null;
  return { findings: v.findings, unresolvedTerms: v.unresolvedTerms };
}

/**
 * One call to Anthropic, tool-use enforced so the response is structured JSON rather than prose
 * that has to be parsed. Never throws — a missing key, network error, timeout, or a malformed /
 * missing tool response all collapse to `{ ok: false }`, so reasonVerdict.ts has exactly one
 * failure branch to fail closed on, matching safety rule 1.
 */
export async function callAi(input: PromptInput): Promise<AiClientResult> {
  if (!env.aiApiKey) return { ok: false, reason: "no_api_key" };

  const client = new Anthropic({ apiKey: env.aiApiKey, timeout: REQUEST_TIMEOUT_MS });
  const startedAt = Date.now();

  try {
    const response = await client.messages.create({
      model: env.aiModel,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [FINDINGS_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
    );
    const parsed = toolUse ? parseToolInput(toolUse.input) : null;
    if (!parsed) {
      // Not a network/API failure — the call succeeded but the model's response didn't match the
      // schema `strict: true` is supposed to guarantee. Log the actual content so this is
      // diagnosable instead of just "unparseable" with no evidence of what came back.
      console.error("[verdict] Anthropic response failed schema validation", {
        stopReason: response.stop_reason,
        content: response.content,
      });
      return { ok: false, reason: "unparseable_response" };
    }

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;

    return {
      ok: true,
      findings: parsed.findings,
      unresolvedTerms: parsed.unresolvedTerms,
      latencyMs: Date.now() - startedAt,
      tokensIn,
      tokensOut,
      costCents: tokensIn * INPUT_CENTS_PER_TOKEN + tokensOut * OUTPUT_CENTS_PER_TOKEN,
    };
  } catch (err) {
    if (err instanceof APIError) {
      // status/error are exactly what a curl against the API directly would show — logging them
      // here is what makes "the key works when I curl it myself" vs. "the app's call fails"
      // actually diagnosable from this process's own logs, instead of indistinguishable from
      // every other failure mode.
      console.error("[verdict] Anthropic API call failed", {
        status: err.status,
        type: err.type,
        body: err.error,
      });
      return { ok: false, reason: `api_error_${err.status ?? "unknown"}` };
    }
    console.error("[verdict] Anthropic API call failed", err);
    return { ok: false, reason: "request_failed" };
  }
}
