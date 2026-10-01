import type { CorrectionType, MyReport, ReviewQueueClaim, ScanCorrection } from "./api";

// Plain functions, no JSX — the wording a family or an admin reads about a correction, kept here
// so it can be tested (`npm test -w client`) and shared between pages instead of drifting apart.

/**
 * What the reporter is told right after filing a correction. Says what actually happened, not what
 * the corroboration flag suggests in general: an add_caution (flag_missing) corroborates on its
 * FIRST report — threshold 1, recordCorrection.ts — so "enough other reports agreed" would be false
 * there. Only a remove_caution (threshold 3) needs others to agree, and even corroborated it still
 * only changes the reporter's own view (docs/principles.md, Sept 10 2026 precedent).
 *
 * "Shows for other families" only when the server says it does (reachesOtherFamilies) — with
 * COMMUNITY_CORRECTIONS switched off, a corroborated addition changes the reporter's own view and
 * nobody else's, and the message has to say what actually happened (principle 7).
 */
export function reportOutcomeMessage(input: {
  correctionType: CorrectionType;
  corroborated: boolean;
  reachesOtherFamilies: boolean;
  hasBarcode: boolean;
}): string {
  if (input.corroborated) {
    if (input.correctionType !== "flag_missing") {
      return (
        "Reported — enough other reports agreed that this is now corroborated. Removing a warning still only " +
        "changes your own view; other families keep seeing it."
      );
    }
    return input.reachesOtherFamilies
      ? "Reported — this warning now shows for other families who scan this product."
      : "Reported — this warning now shows on your own view.";
  }
  if (!input.hasBarcode) {
    return (
      "Reported — thanks. This is recorded against your own view; without a barcode we can't check it " +
      "against anyone else's report of the same product."
    );
  }
  return "Reported — thanks. This is now in the review queue.";
}

/**
 * What the reporter is told when a report doesn't go through. Each failure the reporter can do
 * something about gets its own sentence; "Try again" is only for the ones where trying again might
 * actually work. A duplicate (409 already_reported) can't succeed on retry — its earlier report is
 * still there — so telling them to try again would be advice that cannot work.
 *
 * 413 comes from nginx, not the app (its body isn't JSON, so the code is request_failed_413): the
 * proxy's own size limit, which means the same thing to the reporter as the app's photo_too_large.
 */
export function reportErrorMessage(error: { status: number; code: string }): string {
  if (error.status === 409 && error.code === "already_reported") {
    return "You've already reported this for this product, and that report still stands — there's nothing new to send.";
  }
  if (error.status === 413 || (error.status === 400 && error.code === "photo_too_large")) {
    return "That photo is too large — try a smaller image.";
  }
  if (error.status === 400 && error.code === "invalid_file_type") {
    return "That doesn't look like a photo — please attach a JPEG, PNG, or WebP image.";
  }
  return "Couldn't submit that report. Try again.";
}

/**
 * What the report form says about the reporter's own earlier report of the same claim on this
 * product, before they file — matched the way the server buckets a claim (direction plus exact
 * allergen, null for wrong_product), so this never disagrees with what a submit would do.
 *
 * - A live report (pending or corroborated): filing again is a duplicate the server refuses, so the
 *   form says so up front and `blocking` disables submit.
 * - Only rejected ones: re-filing is allowed (migration 0034), but they shouldn't re-file blind —
 *   they're told it was reviewed and not accepted, and what would help a reviewer now. Never the
 *   admin's reason: that was written for the audit trail, not for them.
 */
export function priorReportNotice(
  reports: Pick<MyReport, "allergen" | "direction" | "status" | "createdAt">[],
  claim: { correctionType: CorrectionType; allergen: string | null },
): { blocking: boolean; message: string } | null {
  const direction = claim.correctionType === "flag_missing" ? "add_caution" : "remove_caution";
  const allergen = claim.correctionType === "wrong_product" ? null : claim.allergen;
  const sameClaim = reports.filter((r) => r.direction === direction && r.allergen === allergen);

  if (sameClaim.some((r) => r.status !== "rejected")) {
    return {
      blocking: true,
      message: "You've already reported this for this product, and that report still stands — there's nothing new to send.",
    };
  }
  const lastRejected = sameClaim.at(-1);
  if (!lastRejected) return null;

  const when = new Date(lastRejected.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    blocking: false,
    message:
      `You reported this on ${when}, and it was reviewed and not accepted. If the product has changed, ` +
      "you can report it again — a clear photo of the current ingredients panel is what the reviewer will look at.",
  };
}

const CORRECTION_CLAIM: Record<CorrectionType, string> = {
  flag_wrong: "isn't actually in this product",
  flag_missing: "is in this product, but wasn't flagged",
  wrong_product: "this is the wrong product entirely",
};

const CORRECTION_STATUS: Record<ScanCorrection["status"], string> = {
  corroborated: "corroborated",
  pending: "pending review",
  rejected: "rejected on review",
};

/**
 * One of the viewer's own reports, as listed under a verdict it changed — on the live card straight
 * after reporting and in scan history later, worded the same in both places.
 */
export function yourReportLine(c: Pick<ScanCorrection, "correctionType" | "allergen" | "status" | "note">): string {
  const what = `${c.allergen ? `${c.allergen} ` : ""}${CORRECTION_CLAIM[c.correctionType]}`;
  return `Your report: ${what} — ${CORRECTION_STATUS[c.status]}${c.note ? ` — "${c.note}"` : ""}`;
}

/**
 * The review queue's per-claim count line. liveReporterCount and deletedAccountReportCount both
 * exclude rejected reports (reviewQueue.ts's groupIntoClaims), while claim.reports lists every
 * report whatever its status — so counting only the first two put "0 reports" directly above the
 * one rejected report the claim lists. The rejected ones are counted from claim.reports and said
 * outright. Correct after a reject too: the page refetches rather than patching counts locally.
 */
export function reportCountLine(
  claim: Pick<ReviewQueueClaim, "liveReporterCount" | "deletedAccountReportCount" | "reports">,
): string {
  const total = claim.reports.length;
  const active = claim.liveReporterCount + claim.deletedAccountReportCount;
  const reports = `${total} ${total === 1 ? "report" : "reports"}`;
  const breakdown =
    `${claim.liveReporterCount} from live accounts` +
    (claim.deletedAccountReportCount > 0 ? `, ${claim.deletedAccountReportCount} from a deleted account` : "");

  if (active === total) return `${reports} — ${breakdown}.`;
  if (active === 0) return `${reports} — ${total === 1 ? "rejected" : "all rejected"}.`;
  return `${reports}, ${active} still active — ${breakdown}.`;
}
