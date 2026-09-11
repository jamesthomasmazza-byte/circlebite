import { useEffect, useState } from "react";

import {
  getAiAccuracyReport,
  type AccuracyBucket,
  type AccuracyCategoryBuckets,
  type AiAccuracyReport,
} from "../lib/api";

// Below report.threshold escalations/attempts, a percentage is noise, not signal — real scan
// volume is still in the single digits. The raw counts always render; only the headline
// percentage is withheld (docs plan, Week 8 AI accuracy page).
function BucketSummary({ label, bucket, threshold }: { label: string; bucket: AccuracyBucket; threshold: number }) {
  if (bucket.escalations === 0) {
    return (
      <p>
        <strong>{label}:</strong> no AI-reviewed scans yet.
      </p>
    );
  }
  if (bucket.rate === null) {
    return (
      <p>
        <strong>{label}:</strong> {bucket.overruled} of {bucket.escalations} overruled — too few (need{" "}
        {threshold}) for a meaningful rate yet.
      </p>
    );
  }
  return (
    <p>
      <strong>{label}:</strong> {Math.round(bucket.rate * 100)}% overruled ({bucket.overruled} of{" "}
      {bucket.escalations}).
    </p>
  );
}

function CategoryBucketsSummary({ buckets, threshold }: { buckets: AccuracyCategoryBuckets; threshold: number }) {
  return (
    <>
      <BucketSummary label="Positive escalations (contains / caution)" bucket={buckets.escalation} threshold={threshold} />
      <BucketSummary label="Unresolved escalations" bucket={buckets.unresolved} threshold={threshold} />
    </>
  );
}

export function AiAccuracy() {
  const [report, setReport] = useState<AiAccuracyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAiAccuracyReport()
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
      <h1>AI accuracy</h1>
      <p>As of {new Date(report.generatedAt).toLocaleString()}.</p>

      <p>
        This measures overrules: someone reporting that the AI wrongly added a caution or a
        contains finding. It <strong>cannot see misses</strong> — an allergen the AI silently
        failed to catch, since nothing prompts a report for the absence of a warning.
      </p>

      <h2>Overall</h2>
      <CategoryBucketsSummary buckets={report.overall} threshold={report.threshold} />

      <h2>Reported misses</h2>
      <p>
        {report.misses.reportedMisses} reported {report.misses.reportedMisses === 1 ? "miss" : "misses"} on{" "}
        {report.misses.aiReviewedScans} AI-reviewed {report.misses.aiReviewedScans === 1 ? "scan" : "scans"}. Not
        a rate — there's no way to know how many real misses went unreported.
      </p>

      <h2>AI call reliability</h2>
      {report.failures.totalAttempts === 0 ? (
        <p>No AI calls attempted yet.</p>
      ) : report.failures.rate === null ? (
        <p>
          {report.failures.totalFailures} of {report.failures.totalAttempts} calls failed — too few (need{" "}
          {report.threshold}) for a meaningful rate yet.
        </p>
      ) : (
        <p>
          {Math.round(report.failures.rate * 100)}% of calls failed ({report.failures.totalFailures} of{" "}
          {report.failures.totalAttempts}).
        </p>
      )}
      {report.failures.byReason.length > 0 && (
        <ul>
          {report.failures.byReason.map((r) => (
            <li key={r.reason}>
              {r.reason}: {r.count}
            </li>
          ))}
        </ul>
      )}

      <h2>By allergen</h2>
      {report.byAllergen.length === 0 ? (
        <p>No AI escalations yet.</p>
      ) : (
        report.byAllergen.map((row) => (
          <section key={row.allergen}>
            <h3>{row.allergen}</h3>
            <CategoryBucketsSummary buckets={row} threshold={report.threshold} />
          </section>
        ))
      )}

      <h2>By model and prompt version</h2>
      {report.byModelPromptVersion.length === 0 ? (
        <p>No AI escalations yet.</p>
      ) : (
        report.byModelPromptVersion.map((row) => (
          <section key={`${row.model} ${row.promptVersion}`}>
            <h3>
              {row.model} — {row.promptVersion}
            </h3>
            <CategoryBucketsSummary buckets={row} threshold={report.threshold} />
          </section>
        ))
      )}
    </main>
  );
}
