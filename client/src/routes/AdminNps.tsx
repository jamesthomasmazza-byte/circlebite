import { useEffect, useState } from "react";

import { getNpsReport, type NpsReport } from "../lib/api";

export function AdminNps() {
  const [report, setReport] = useState<NpsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNpsReport()
      .then(setReport)
      .catch(() => setError("Couldn't load this page."));
  }, []);

  if (error) {
    return (
      <main>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!report) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main>
      <h1>NPS</h1>

      {report.n === 0 ? (
        <p>No responses yet.</p>
      ) : (
        <>
          <p>
            {report.n} response{report.n === 1 ? "" : "s"} ({report.realCount} real, {report.seededCount} seeded).
          </p>

          {report.npsScore === null ? (
            <p>
              {report.promoters} promoter{report.promoters === 1 ? "" : "s"}, {report.passives} passive
              {report.passives === 1 ? "" : "s"}, {report.detractors} detractor{report.detractors === 1 ? "" : "s"} (
              {report.n} total) — too few (need {report.threshold}) for a meaningful score yet.
            </p>
          ) : (
            <p>
              <strong>{report.npsScore}</strong> ({report.promoters} promoter{report.promoters === 1 ? "" : "s"},{" "}
              {report.passives} passive{report.passives === 1 ? "" : "s"}, {report.detractors} detractor
              {report.detractors === 1 ? "" : "s"}, {report.n} total).
            </p>
          )}

          {report.seedCarriedScore && (
            <p role="alert">
              Real responses alone ({report.realCount}) are still below the threshold (
              {report.threshold}) — this score only appears because seeded rows pushed the total
              over it, not because real user sentiment has reached a meaningful sample yet.
            </p>
          )}
        </>
      )}

      <h2>Reasons</h2>
      {report.reasons.length === 0 ? (
        <p>No reasons given yet.</p>
      ) : (
        <ul>
          {report.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
