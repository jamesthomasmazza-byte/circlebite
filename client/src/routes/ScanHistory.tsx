import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { historyRowLabel, shopperCount } from "../lib/allergenRowCopy";
import { getProfile, getScanHistory, type ScanHistoryEntry } from "../lib/api";
import {
  circleReportLine,
  heldRemovalNotes,
  UNCHANGED_BY_YOUR_REPORT,
  yourReportLine,
  yourReportsChangedCard,
} from "../lib/correctionCopy";
import { NO_SCANS, SCAN_A_PRODUCT } from "../lib/emptyStateCopy";
import { HISTORY_SAMPLE_TAG, isSampleScan } from "../lib/sampleScan";
import { shortDateTime } from "../lib/dateCopy";
import { historyUncheckedNote, uncheckedBasis } from "../lib/evidenceCopy";
import { historyChangedLine, historyNotCheckedLine, REPORT_NOT_SHARED } from "../lib/historyCopy";
import { DISCLAIMER, EMERGENCY, VERDICT_LABEL } from "../lib/verdictCopy";

export function ScanHistory() {
  const { id } = useParams<{ id: string }>();
  const [scans, setScans] = useState<ScanHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only for a follower's circle-report line, "a co-manager in Maya's circle"; without it the line
  // says "this profile's circle".
  const [profileLabel, setProfileLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getScanHistory(id)
      .then(setScans)
      .catch(() => setError("Couldn't load scan history — you may not have access to this profile."));
    getProfile(id)
      .then((p) => setProfileLabel(p.label))
      .catch(() => setProfileLabel(null));
  }, [id]);

  return (
    <main>
      <p>
        <Link to={id ? `/profiles/${id}` : "/profiles"}>← Back to profile</Link>
      </p>
      <h1>Recent scans</h1>
      {/* Once for the whole list, not per entry: every verdict below is read under it. */}
      <div role="note" className="verdict-card__disclaimer scan-history__disclaimer">
        <p>{DISCLAIMER}</p>
        <p>
          <strong>{EMERGENCY}</strong>
        </p>
      </div>

      {error && <p role="alert">{error}</p>}

      {scans && scans.length === 0 && (
        <p>
          {NO_SCANS} <Link to={id ? `/scan?profile=${id}` : "/scan"}>{SCAN_A_PRODUCT}</Link>
        </p>
      )}

      {scans && scans.length > 0 && (
        // One card per scan (the visual pass, 2026-10-26).
        <ul className="card-list">
          {scans.map((scan) => (
            <ScanHistoryEntryCard key={scan.id} scan={scan} profileLabel={profileLabel} />
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * One history entry as a summary (2026-10-28 audit; BACKLOG.md Week 9): the verdict word in its
 * colour, the product, the date, the allergen rows, and one line each for what changed it and what
 * wasn't checked. The reasoning behind those lines — the unchecked note, "Originally … changed
 * because of", the reporter lines — goes in a closed disclosure. Uncertainty never does: "not yet
 * confirmed" and every unchecked allergen's name stay outside it (lib/historyCopy.ts).
 */
export function ScanHistoryEntryCard({ scan, profileLabel }: { scan: ScanHistoryEntry; profileLabel: string | null }) {
  // CONTEST_RULES.md §3: a user's own correction overrides their view immediately — but never
  // silently (docs/legacy-spec.md §6). The effective state is the headline; the summary line opens
  // with the original verdict ("Was Unable to confirm — changed by …"), and the why is in the disclosure.
  const shown = scan.effective ?? scan.original;
  const rows = shown.matched_allergens.filter((m) => m.classification !== "clear" && m.classification !== "unchecked");
  const unchecked = shown.matched_allergens.filter((m) => m.classification === "unchecked");
  const changed = historyChangedLine(scan);
  const notChecked = historyNotCheckedLine(scan);
  const rejectedOnly = !scan.effective && scan.corrections.length > 0;
  const hasDetails = unchecked.length > 0 || rejectedOnly || scan.effective !== null;

  return (
    <li className="card history-entry">
      <p className="history-entry__head">
        <strong className="history-entry__verdict" data-verdict={shown.result}>
          {VERDICT_LABEL[shown.result]}
        </strong>{" "}
        — {scan.product_name ?? "Unknown product"}
        {isSampleScan(scan.barcode) && <span className="sample-scan__tag">{HISTORY_SAMPLE_TAG}</span>}
        {scan.product_brand && ` (${scan.product_brand})`}
      </p>
      <time className="card__meta card__line" dateTime={scan.created_at}>
        {shortDateTime(scan.created_at)}
      </time>
      {rows.length > 0 && (
        <ul className="history-entry__rows">
          {rows.map((m) => (
            <li key={m.allergenName}>
              {m.allergenName} ({m.severity}) — {historyRowLabel(m)}
            </li>
          ))}
        </ul>
      )}
      {changed && <p className="history-entry__summary">{changed}</p>}
      {notChecked && <p className="history-entry__summary">{notChecked}</p>}
      {hasDetails && (
        <details className="history-entry__details">
          <summary>Details</summary>
          {unchecked.length > 0 && (
            // Grouped, not one row each — same reasoning as Scan.tsx's live result.
            <p role="note">
              {historyUncheckedNote(
                unchecked.map((m) => m.allergenName.toLowerCase()),
                uncheckedBasis(unchecked),
              )}
            </p>
          )}
          {rejectedOnly && (
            // Only reachable when every report here is a rejected removal — those stop applying
            // (docs/principles.md principle 1), so this is the engine's own verdict again. The summary
            // line says so; these are the reports it means.
            <ul>
              {scan.corrections.map((c) => (
                <li key={c.id}>{yourReportLine(c)}</li>
              ))}
            </ul>
          )}
          {scan.effective && (
            <div role="note">
              {/* Only the viewer's own removals here: those are noted on the row, never applied
                  (2026-10-23), so "Originally … — changed because of" would be false. */}
              {scan.corrections.length > 0 &&
              !yourReportsChangedCard(scan.corrections) &&
              scan.community_reports.length === 0 &&
              scan.pending_circle_reports.length === 0 ? (
                <p>{UNCHANGED_BY_YOUR_REPORT}</p>
              ) : (
                <p>
                  Originally <strong>{VERDICT_LABEL[scan.original.result]}</strong> — changed because of:
                </p>
              )}
              <ul>
                {scan.corrections.map((c) => (
                  <li key={c.id}>{yourReportLine(c)}</li>
                ))}
                {/* Read fresh, so this can name a report made after the scan itself — which is the
                    point: a warning about something already in the pantry. */}
                {scan.community_reports.map((r) => (
                  <li key={`community-${r.allergenName}`}>
                    {r.allergenName} — reported present by {shopperCount(r.reporterCount)}, with a photo of the label
                  </li>
                ))}
                {/* Last and lightest: the least-supported claim on the card (JT, 2026-10-16). */}
                {scan.pending_circle_reports.map((r) => (
                  <li key={`circle-${r.allergenName}`} className="circle-report">
                    {circleReportLine(r, profileLabel)}
                  </li>
                ))}
                {/* A severe_only follower can have a verdict changed by a report about an allergen
                    their share level hides. Still never silent — just not named. */}
                {scan.corrections.length === 0 &&
                  scan.community_reports.length === 0 &&
                  scan.pending_circle_reports.length === 0 && <li>{REPORT_NOT_SHARED}</li>}
              </ul>
              {heldRemovalNotes(scan.corrections, scan.community_reports).map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          )}
        </details>
      )}
    </li>
  );
}
