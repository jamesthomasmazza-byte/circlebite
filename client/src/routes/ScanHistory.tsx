import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { historyRowLabel, shopperCount } from "../lib/allergenRowCopy";
import { getScanHistory, type ScanHistoryEntry } from "../lib/api";
import {
  circleReportLine,
  heldRemovalNotes,
  UNCHANGED_BY_YOUR_REPORT,
  yourReportLine,
  yourReportsChangedCard,
} from "../lib/correctionCopy";
import { NO_SCANS, SCAN_A_PRODUCT } from "../lib/emptyStateCopy";
import { historyUncheckedNote, uncheckedBasis } from "../lib/evidenceCopy";
import { DISCLAIMER, EMERGENCY, VERDICT_LABEL } from "../lib/verdictCopy";

export function ScanHistory() {
  const { id } = useParams<{ id: string }>();
  const [scans, setScans] = useState<ScanHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getScanHistory(id)
      .then(setScans)
      .catch(() => setError("Couldn't load scan history — you may not have access to this profile."));
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
        <ul>
          {scans.map((scan) => {
            // CONTEST_RULES.md §3: a user's own correction overrides their view immediately — but
            // never silently (docs/legacy-spec.md §6). The effective state is the headline; the
            // original always ships alongside it in a visible callout naming what changed and why.
            const shown = scan.effective ?? scan.original;
            return (
              <li key={scan.id}>
                <strong>{VERDICT_LABEL[shown.result]}</strong> — {scan.product_name ?? "Unknown product"}
                {scan.product_brand && ` (${scan.product_brand})`} — {new Date(scan.created_at).toLocaleString()}
                {shown.matched_allergens.filter((m) => m.classification !== "clear" && m.classification !== "unchecked")
                  .length > 0 && (
                  <ul>
                    {shown.matched_allergens
                      .filter((m) => m.classification !== "clear" && m.classification !== "unchecked")
                      .map((m) => (
                        <li key={m.allergenName}>
                          {m.allergenName} ({m.severity}) — {historyRowLabel(m)}
                        </li>
                      ))}
                  </ul>
                )}
                {(() => {
                  // Grouped, not one row each — same reasoning as Scan.tsx's live result. No
                  // profile-name possessive here (this page doesn't load the profile's own label,
                  // only per-scan product info), unlike the live card's "Timmy's allergens" phrasing.
                  const unchecked = shown.matched_allergens.filter((m) => m.classification === "unchecked");
                  if (unchecked.length === 0) return null;
                  const names = unchecked.map((m) => m.allergenName.toLowerCase());
                  return <p role="note">{historyUncheckedNote(names, uncheckedBasis(unchecked))}</p>;
                })()}
                {!scan.effective && scan.corrections.length > 0 && (
                  // Only reachable when every report here is a rejected removal — those stop
                  // applying (docs/principles.md principle 1), so this is the engine's own verdict
                  // again. Said, not silent: this person may last have seen it cleared.
                  <div role="note">
                    <p>Your report was reviewed and rejected, so this shows the original verdict again:</p>
                    <ul>
                      {scan.corrections.map((c) => (
                        <li key={c.id}>{yourReportLine(c)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {scan.effective && (
                  <div role="note">
                    {/* Only the viewer's own removals here: those are noted on the row, never
                        applied (2026-10-23), so "Originally … — changed because of" would be false. */}
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
                      {/* Read fresh, so this can name a report made after the scan itself — which is
                          the point: a warning about something already in the pantry. */}
                      {scan.community_reports.map((r) => (
                        <li key={`community-${r.allergenName}`}>
                          {r.allergenName} — reported present by {shopperCount(r.reporterCount)}, with a photo of the
                          label
                        </li>
                      ))}
                      {/* Last and lightest: the least-supported claim on the card (JT, 2026-10-16). */}
                      {scan.pending_circle_reports.map((r) => (
                        <li key={`circle-${r.allergenName}`} className="circle-report">
                          {circleReportLine(r)}
                        </li>
                      ))}
                      {/* A severe_only follower can have a verdict changed by a report about an
                          allergen their share level hides. Still never silent — just not named. */}
                      {scan.corrections.length === 0 &&
                        scan.community_reports.length === 0 &&
                        scan.pending_circle_reports.length === 0 && (
                          <li>A report about an allergen on this profile that isn't shared with you</li>
                        )}
                    </ul>
                    {heldRemovalNotes(scan.corrections, scan.community_reports).map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
