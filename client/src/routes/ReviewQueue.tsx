import { useEffect, useState } from "react";

import {
  ApiRequestError,
  getReviewQueue,
  rejectCorrection,
  reviewQueuePhotoUrl,
  type ReviewQueueClaim,
  type ReviewQueueReport,
} from "../lib/api";

function claimTitle(claim: ReviewQueueClaim): string {
  const what = claim.allergen ?? "product identity (wrong_product)";
  const directionLabel = claim.direction === "add_caution" ? "reported as present" : "reported as not present";
  return `${claim.barcode ?? "no barcode"} — ${what} — ${directionLabel}`;
}

function ReportCount({ claim }: { claim: ReviewQueueClaim }) {
  const total = claim.liveReporterCount + claim.deletedAccountReportCount;
  if (claim.deletedAccountReportCount === 0) {
    return (
      <p>
        {total} {total === 1 ? "report" : "reports"} — {claim.liveReporterCount} from live accounts.
      </p>
    );
  }
  return (
    <p>
      {total} {total === 1 ? "report" : "reports"} — {claim.liveReporterCount} from live accounts,{" "}
      {claim.deletedAccountReportCount} from a deleted account.
    </p>
  );
}

function ReportRow({
  claim,
  report,
  onReject,
  rejecting,
  rejectError,
  reasonDraft,
  onReasonChange,
}: {
  claim: ReviewQueueClaim;
  report: ReviewQueueReport;
  onReject: () => void;
  rejecting: boolean;
  rejectError: string | null;
  reasonDraft: string;
  onReasonChange: (value: string) => void;
}) {
  const requiresReason = claim.direction === "add_caution";
  const canSubmit = !rejecting && (!requiresReason || reasonDraft.trim().length > 0);

  return (
    <li>
      <p>
        <strong>{report.reporterLabel}</strong> — {report.correctionType} ({report.target}) — {report.createdAt}
      </p>
      {report.note && <p>&ldquo;{report.note}&rdquo;</p>}
      <p>
        <a href={reviewQueuePhotoUrl(report.id)} target="_blank" rel="noreferrer">
          View label photo
        </a>
      </p>
      {report.status === "rejected" ? (
        <p>
          Rejected by {report.rejectedBy?.email ?? "an admin whose account was later deleted"} on {report.rejectedAt}
          {report.rejectionReason && <> — &ldquo;{report.rejectionReason}&rdquo;</>}
        </p>
      ) : (
        <>
          {requiresReason && (
            <p>
              <label>
                Why is this being rejected?{" "}
                <input
                  type="text"
                  value={reasonDraft}
                  onChange={(e) => onReasonChange(e.target.value)}
                  disabled={rejecting}
                />
              </label>
            </p>
          )}
          <button type="button" onClick={onReject} disabled={!canSubmit}>
            {rejecting ? "Rejecting…" : "Reject this report"}
          </button>
          {rejectError && <p role="alert">{rejectError}</p>}
        </>
      )}
    </li>
  );
}

function ClaimSection({
  claim,
  rejectingId,
  rejectErrors,
  reasonDrafts,
  onReasonChange,
  onReject,
}: {
  claim: ReviewQueueClaim;
  rejectingId: string | null;
  rejectErrors: Record<string, string | null>;
  reasonDrafts: Record<string, string>;
  onReasonChange: (reportId: string, value: string) => void;
  onReject: (claim: ReviewQueueClaim, report: ReviewQueueReport) => void;
}) {
  return (
    <section>
      <h3>{claimTitle(claim)}</h3>
      <ReportCount claim={claim} />
      {claim.sameCircleWarning && (
        <p>
          Two or more of the live reporters on this claim share a circle (they manage or follow the same profile) —
          treat the corroboration count above as weaker than it looks.
        </p>
      )}
      <ul>
        {claim.reports.map((report) => (
          <ReportRow
            key={report.id}
            claim={claim}
            report={report}
            rejecting={rejectingId === report.id}
            rejectError={rejectErrors[report.id] ?? null}
            reasonDraft={reasonDrafts[report.id] ?? ""}
            onReasonChange={(value) => onReasonChange(report.id, value)}
            onReject={() => onReject(claim, report)}
          />
        ))}
      </ul>
    </section>
  );
}

export function ReviewQueue() {
  const [claims, setClaims] = useState<ReviewQueueClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectErrors, setRejectErrors] = useState<Record<string, string | null>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});

  function load() {
    getReviewQueue()
      .then(setClaims)
      .catch(() => setError("Couldn't load this page."));
  }

  useEffect(load, []);

  function handleReasonChange(reportId: string, value: string) {
    setReasonDrafts((prev) => ({ ...prev, [reportId]: value }));
  }

  async function handleReject(claim: ReviewQueueClaim, report: ReviewQueueReport) {
    const isAddCaution = claim.direction === "add_caution";
    const reason = isAddCaution ? (reasonDrafts[report.id] ?? "").trim() : null;
    if (isAddCaution && !reason) return;

    const confirmed = window.confirm(
      isAddCaution
        ? "Reject this report? This immediately stops showing this warning to other families — including on scans already in their history, not just new ones."
        : "Reject this report? This only affects the reporter's own view — removals don't propagate to other families yet.",
    );
    if (!confirmed) return;

    setRejectingId(report.id);
    setRejectErrors((prev) => ({ ...prev, [report.id]: null }));
    try {
      await rejectCorrection(report.id, reason);
      // Full refetch, not a local patch: a reject can change the claim's derived status,
      // liveReporterCount and sameCircleWarning, not just the one report's own fields — refetching
      // keeps all of that correct without duplicating groupIntoClaims's logic client-side. Fine at
      // this data volume (aiAccuracyReport.ts's own "handful of rows" precedent applies here too).
      load();
    } catch (err) {
      setRejectErrors((prev) => ({
        ...prev,
        [report.id]: err instanceof ApiRequestError && err.status === 409 ? "Already rejected — reload the page." : "Couldn't reject this report.",
      }));
    } finally {
      setRejectingId(null);
    }
  }

  if (error) {
    return (
      <main>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!claims) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (claims.length === 0) {
    return (
      <main>
        <h1>Review queue</h1>
        <p>No corrections yet.</p>
      </main>
    );
  }

  // Barcode-less Path C claims (docs/verdict-engine.md) are always singleton — one report each,
  // never corroborated (recordCorrection.ts skips that entirely for them) — so they get their own
  // section rather than being mixed into the corroborated/pending/resolved buckets below, which
  // would otherwise imply they could aggregate the way barcode-keyed claims do.
  const noBarcode = claims.filter((c) => c.barcode === null);
  const barcoded = claims.filter((c) => c.barcode !== null);

  const corroborated = barcoded.filter((c) => c.status === "corroborated");
  const addCautionCorroborated = corroborated.filter((c) => c.direction === "add_caution");
  const removeCautionCorroborated = corroborated.filter((c) => c.direction === "remove_caution");
  const pending = barcoded.filter((c) => c.status === "pending");
  const resolved = barcoded.filter((c) => c.status === "rejected");

  const claimSectionProps = { rejectingId, rejectErrors, reasonDrafts, onReasonChange: handleReasonChange, onReject: handleReject };

  return (
    <main>
      <h1>Review queue</h1>
      <p>Browse and reject reported corrections instead of running SQL (docs/server-setup.md §11).</p>

      <h2>Photo reports (no barcode)</h2>
      <p>
        Reports against a scan photographed with no barcode at all — there's no reliable way to tell
        two users' photos are of the same product, so these never corroborate across users and each
        one is shown on its own, for oversight only.
      </p>
      {noBarcode.length === 0 ? (
        <p>None yet.</p>
      ) : (
        noBarcode.map((claim) => (
          <ClaimSection key={claim.reports[0]?.id ?? claimTitle(claim)} claim={claim} {...claimSectionProps} />
        ))
      )}

      <h2>Currently applied</h2>
      {addCautionCorroborated.length === 0 && removeCautionCorroborated.length === 0 ? (
        <p>Nothing corroborated yet.</p>
      ) : (
        <>
          {addCautionCorroborated.length > 0 && (
            <>
              <h3>Warnings currently shown to other families</h3>
              <p>
                Rejecting the last live report on one of these claims immediately stops the warning from showing on
                other families' scans — including scans already in their history, not just new ones.
              </p>
              {addCautionCorroborated.map((claim) => (
                <ClaimSection key={claimTitle(claim)} claim={claim} {...claimSectionProps} />
              ))}
            </>
          )}
          {removeCautionCorroborated.length > 0 && (
            <>
              <h3>Removals reported (reporter's own view only)</h3>
              <p>
                This direction doesn't propagate to other profiles yet (docs/principles.md's precedent on
                community-additions-reach-other-profiles) — rejecting one only affects that reporter's own view.
              </p>
              {removeCautionCorroborated.map((claim) => (
                <ClaimSection key={claimTitle(claim)} claim={claim} {...claimSectionProps} />
              ))}
            </>
          )}
        </>
      )}

      <h2>Needs attention</h2>
      <p>Still accumulating reports toward the threshold — always the "reported as not present" direction, since
        the other direction corroborates on its first report.</p>
      {pending.length === 0 ? (
        <p>Nothing pending.</p>
      ) : (
        pending.map((claim) => <ClaimSection key={claimTitle(claim)} claim={claim} {...claimSectionProps} />)
      )}

      <h2>Resolved</h2>
      {resolved.length === 0 ? (
        <p>Nothing resolved yet.</p>
      ) : (
        resolved.map((claim) => <ClaimSection key={claimTitle(claim)} claim={claim} {...claimSectionProps} />)
      )}
    </main>
  );
}
