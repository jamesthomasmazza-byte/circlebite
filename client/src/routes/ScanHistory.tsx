import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getScanHistory, type ScanHistoryEntry, type Verdict } from "../lib/api";

const VERDICT_LABEL: Record<Verdict, string> = {
  safe: "Safe",
  contains_allergen: "Contains an allergen",
  may_contain_caution: "May contain — caution",
  unable_to_confirm: "Unable to confirm",
};

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

      {error && <p role="alert">{error}</p>}

      {scans && scans.length === 0 && <p>No scans yet.</p>}

      {scans && scans.length > 0 && (
        <ul>
          {scans.map((scan) => (
            <li key={scan.id}>
              <strong>{VERDICT_LABEL[scan.result]}</strong> — {scan.product_name ?? "Unknown product"}
              {scan.product_brand && ` (${scan.product_brand})`} — {new Date(scan.created_at).toLocaleString()}
              {scan.matched_allergens.filter((m) => m.classification !== "clear").length > 0 && (
                <ul>
                  {scan.matched_allergens
                    .filter((m) => m.classification !== "clear")
                    .map((m) => (
                      <li key={m.allergenName}>
                        {m.allergenName} ({m.severity}) — {m.classification === "contains" ? "contains" : "may contain traces"}
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
