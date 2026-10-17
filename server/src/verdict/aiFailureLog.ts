// One line per failed or skipped AI step, so an outage shows up in `journalctl -u circlebite` the
// day it starts. The production key was expired Oct 10–16, 2026. No AI call appears in the journal
// for that window, so most likely no scan was affected, but had one been, the card would have looked
// clean, and only an expired or rejected key would have logged: aiClient.ts logs API and parse
// errors, never a missing key or the spend cap (docs/journal.md, 2026-10-16/17).
//
// The reason code and where it happened, nothing else: no key, no label or ingredient text, nothing
// about the person or profile. The codes are aiClient.ts's and the spend guard's own fixed set
// (no_api_key, spend_cap_exceeded, api_error_<status>, request_failed, unparseable_response).

export type AiPath = "B" | "C" | "D";
export type AiStep = "reasoning" | "label_reading";

export function logAiFailure(path: AiPath, step: AiStep, reason: string | null): void {
  console.error("[verdict] AI step failed", { reason: reason ?? "unknown", path, step });
}
