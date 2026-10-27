import type {
  CircleReport,
  CircleReporter,
  CommunityReport,
  CorrectionType,
  MyReport,
  ProfileSummary,
  ReviewQueueClaim,
  ScanCorrection,
} from "./api";

// Plain functions, no JSX — the wording a family or an admin reads about a correction, kept here
// so it can be tested (`npm test -w client`) and shared between pages instead of drifting apart.

/**
 * What the reporter is told right after filing a correction. Says what actually happened, not what
 * the corroboration flag suggests in general. An add_caution (flag_missing) corroborates once a
 * second family reports it (threshold 2, recordCorrection.ts); until then it is pending, but it has
 * already changed the reporter's own card, and the message says so rather than only "in the review
 * queue". A corroborated addition never says "enough other reports agreed" — it may be the one
 * report that completed the pair. A remove_caution (threshold 3), even corroborated, still only
 * changes the reporter's own view (docs/principles.md, Sept 10 2026 precedent).
 *
 * "Shows for other families" only when the server says it does (reachesOtherFamilies) — with
 * COMMUNITY_CORRECTIONS switched off, a corroborated addition changes the reporter's own view and
 * nobody else's, and the message has to say what actually happened (principle 7). The same for
 * "everyone who can see this profile" (reachesCircle, CIRCLE_ESCALATIONS).
 */
export function reportOutcomeMessage(input: {
  correctionType: CorrectionType;
  corroborated: boolean;
  reachesOtherFamilies: boolean;
  reachesCircle: boolean;
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
  if (!input.hasBarcode && input.reachesCircle) {
    return (
      "Reported — this warning now shows on this scan for everyone who can see this profile. Without a barcode " +
      "we can't check it against anyone else's report of the same product."
    );
  }
  if (!input.hasBarcode) {
    return (
      "Reported — thanks. This is recorded against your own view; without a barcode we can't check it " +
      "against anyone else's report of the same product."
    );
  }
  if (input.correctionType === "flag_missing" && input.reachesCircle) {
    return (
      "Reported — this warning now shows for everyone who can see this profile, and it's in the review queue. " +
      "Other families see it only once a second family reports it too."
    );
  }
  if (input.correctionType === "flag_missing") {
    return "Reported — this warning now shows on your own view, and it's in the review queue.";
  }
  return "Reported — thanks. This is now in the review queue.";
}

/**
 * Which report types this viewer may file on a scan of this profile. Removals (flag_wrong,
 * wrong_product) are for the profile's owner or a co-manager — the ones listProfiles returns under
 * `managed`, with a `relationship` — per docs/approvals/2026-10-01-yoest-mvp-statement.md; a
 * follower may only report an allergen present. The server enforces the same rule
 * (routes/corrections.ts, 403 removal_requires_manager); this just keeps the form from offering a
 * report it would refuse. An unknown profile gets the follower's list: the safe default.
 */
export function reportableTypes(managedProfiles: Pick<ProfileSummary, "id">[], profileId: string | null): CorrectionType[] {
  const canFileRemovals = profileId !== null && managedProfiles.some((p) => p.id === profileId);
  return canFileRemovals ? ["flag_wrong", "flag_missing", "wrong_product"] : ["flag_missing"];
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
  if (error.status === 403 && error.code === "removal_requires_manager") {
    return "Only the people who manage this profile can report that an allergen isn't there. You can still report one that is.";
  }
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
 * Whether any of the viewer's own reports changed what their card says. A report that something IS
 * in the product does (it sets "contains"), and so does an unrejected wrong-product report. A report
 * that an allergen isn't there never does — it's noted on the row (disputedNote), never applied
 * (server corrections/applyCorrections.ts; docs/verdict-engine.md principle 6, amended 2026-10-23).
 */
export function yourReportsChangedCard(corrections: Pick<ScanCorrection, "correctionType" | "status">[]): boolean {
  return corrections.some(
    (c) => c.correctionType === "flag_missing" || (c.correctionType === "wrong_product" && c.status !== "rejected"),
  );
}

/** What heads the viewer's own report lines when none of them changed the card. */
export const UNCHANGED_BY_YOUR_REPORT = "Your report hasn't changed it:";

/**
 * Why a removal the parent asked for is held: a confirmed report that the allergen is in this
 * product stands, and a confirmed warning outranks a removal in corroboration
 * (recordCorrection.ts's warning-survives check) and, for wrong_product, on the card. Since
 * 2026-10-23 a flag_wrong never changes the card anyway (disputedNote), so the Milk note no longer
 * says "on your card too" — it says what else is true: other families confirmed what they dispute.
 *
 * "Held", never "declined" or "rejected": nobody said no. The request stays pending, still with the
 * reviewers, and nothing here invites re-filing — a live report can't be re-filed.
 *
 * Names only the parent's own allergen, as community_reports already does: the shoppers' report is
 * labelled with this profile's name for the allergen (applyCommunityCorrections.ts), whatever the
 * shoppers' own profiles call it, and nothing else about it reaches the client.
 */
export function heldRemovalNotes(
  corrections: Pick<ScanCorrection, "correctionType" | "allergen" | "status">[],
  communityReports: Pick<CommunityReport, "allergenName">[],
): string[] {
  const confirmed = (allergen: string) => communityReports.some((r) => r.allergenName.toLowerCase() === allergen.toLowerCase());
  const notes: string[] = [];
  for (const c of corrections) {
    if (c.status === "rejected") continue;
    if (c.correctionType === "flag_wrong" && c.allergen && confirmed(c.allergen)) {
      notes.push(
        `Your request to remove ${c.allergen} is held. A confirmed report of ${c.allergen} stands on this product. ` +
          "A reviewer sees both your request and the warning.",
      );
    }
    if (c.correctionType === "wrong_product" && communityReports.length > 0) {
      const names = communityReports.map((r) => r.allergenName);
      const list = listOf(names);
      notes.push(
        `Your report that this is the wrong product is held. Confirmed reports of ${list} stand on this product, so ` +
          `${names.length === 1 ? "that caution stays" : "those cautions stay"}, on your card too. A reviewer sees both your ` +
          "report and the warnings.",
      );
    }
  }
  return notes;
}

function listOf(items: string[]): string {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const ROLE_LABEL: Record<NonNullable<CircleReporter["role"]>, string> = {
  owner: "owner",
  co_manager: "co-manager",
  follower: "follower",
};

/** Who filed a circle report, as the card names them. Never an email address — the server never sends one.
 *  For a reporter the server withheld, circleReportLine says the role instead. */
export function circleReporterName(r: CircleReporter): string {
  if (r.isViewer) return "You";
  if (r.name === null) return "Someone whose account has since been deleted";
  if (r.role === null) return `${r.name} (no longer in this circle)`;
  return `${r.name} (${ROLE_LABEL[r.role]})`;
}

/**
 * The line under "The product data alone says …" naming what changed the card. Each source is
 * named only when it's there: a card changed by a circle report alone must not say shoppers did.
 *
 * A circle report alone gets history's own wording, "Changed because of:" (JT, 2026-10-16, from the
 * rendered card): the line under it already says who reported it and that they photographed the
 * label, and the allergen row already says "reported in your circle". Naming either here said each
 * twice for one report.
 */
export function changedByLine(sources: { yours: boolean; shoppers: boolean; circle: boolean }): string {
  const named = [
    sources.yours && "your report",
    sources.shoppers && "shopper reports",
    sources.circle && "a report from your circle",
  ].filter((s): s is string => Boolean(s));
  if (named.length === 0) return "";
  if (named.length === 1 && sources.circle) return "Changed because of:";
  return `Changed by ${listOf(named)}, each with a photo of the label:`;
}

/**
 * One pending circle report, as the card lists it (server corrections/circleEscalations.ts): who
 * reported it and that they photographed the label, then that no other family has confirmed it.
 * Two sentences, by JT's read of the rendered card (2026-10-16):
 * - Not why the card says Contains — the line above the list already says what changed it.
 * - Not who else sees it or who can lift it — true, but mechanics a parent holding the box can't
 *   act on. They belong in the review queue.
 * - Never "say-so": the photo is what makes a report evidence, and what makes corroboration mean
 *   something.
 * "Not yet confirmed" itself lives on the allergen row (allergenRowCopy.ts), attached to the
 * verdict; this line says it once more, in its own words, and nothing else does.
 */
export function circleReportLine(report: CircleReport, profileLabel: string | null = null): string {
  // The viewer first, so "You" never lands mid-sentence; then those shown by role; then by name.
  const others = report.reporters.filter((r) => !r.isViewer);
  const who = listOf([
    ...report.reporters.filter((r) => r.isViewer).map(circleReporterName),
    ...withheldReporters(others, profileLabel),
    ...others.filter((r) => !r.withheld).map(circleReporterName),
  ]);
  return `${capitalized(who)} reported ${report.allergenName} present and photographed the label. No other family has confirmed it yet.`;
}

const COUNT_WORD = ["", "a", "two", "three", "four", "five"];

function counted(n: number, one: string, many: string): string {
  return n === 1 ? `${COUNT_WORD[1]} ${one}` : `${COUNT_WORD[n] ?? n} ${many}`;
}

/**
 * The reporters a follower is shown by role only (server circleEscalations.ts, JT 2026-10-27):
 * "the owner of Maya's profile", "a co-manager and another follower in Maya's circle", "someone who
 * has since left Maya's circle". Only a follower is ever sent a withheld reporter, so a follower who
 * reported is "another follower". Names the profile, not "this child": a profile can be an adult's
 * own.
 */
function withheldReporters(reporters: CircleReporter[], profileLabel: string | null): string[] {
  const withheld = reporters.filter((r) => r.withheld);
  const count = (role: CircleReporter["role"]) => withheld.filter((r) => r.role === role).length;
  const circle = profileLabel ? `${profileLabel}'s circle` : "this profile's circle";
  const phrases: string[] = [];
  if (count("owner") > 0) phrases.push(profileLabel ? `the owner of ${profileLabel}'s profile` : "the owner of this profile");
  const members = [
    count("co_manager") > 0 && counted(count("co_manager"), "co-manager", "co-managers"),
    count("follower") > 0 && (count("follower") === 1 ? "another follower" : `${COUNT_WORD[count("follower")] ?? count("follower")} other followers`),
  ].filter((m): m is string => Boolean(m));
  if (members.length > 0) phrases.push(`${listOf(members)} in ${circle}`);
  const left = count(null);
  if (left > 0) phrases.push(left === 1 ? `someone who has since left ${circle}` : `${COUNT_WORD[left] ?? left} people who have since left ${circle}`);
  return phrases;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
