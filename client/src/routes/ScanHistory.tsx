import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getScanHistory, type MatchedAllergen, type ScanCorrection, type ScanHistoryEntry, type Verdict } from "../lib/api";

const VERDICT_LABEL: Record<Verdict, string> = {
  safe: "Safe",
  contains_allergen: "Contains an allergen",
  may_contain_caution: "May contain — caution",
  unable_to_confirm: "Unable to confirm",
};

const CORRECTION_TYPE_LABEL: Record<ScanCorrection["correctionType"], string> = {
  flag_wrong: "isn't actually in this product",
  flag_missing: "is in this product, but wasn't flagged",
  wrong_product: "this is the wrong product entirely",
};

// "unresolved" only appears on a scan that ran the AI reasoning step (docs/verdict-engine.md Path
// B) — real model uncertainty, distinct from "may contain traces".
function classificationLabel(classification: MatchedAllergen["classification"]): string {
  if (classification === "contains") return "contains";
  if (classification === "unresolved") return "couldn't confirm from the label text";
  return "may contain traces";
}

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
          {scans.map((scan) => {
            // CONTEST_RULES.md §3: a user's own correction overrides their view immediately — but
            // never silently (docs/legacy-spec.md §6). The effective state is the headline; the
            // original always ships alongside it in a visible callout naming what changed and why.
            const shown = scan.effective ?? scan.original;
            return (
              <li key={scan.id}>
                <strong>{VERDICT_LABEL[shown.result]}</strong> — {scan.product_name ?? "Unknown product"}
                {scan.product_brand && ` (${scan.product_brand})`} — {new Date(scan.created_at).toLocaleString()}
                {shown.matched_allergens.filter((m) => m.classification !== "clear").length > 0 && (
                  <ul>
                    {shown.matched_allergens
                      .filter((m) => m.classification !== "clear")
                      .map((m) => (
                        <li key={m.allergenName}>
                          {m.allergenName} ({m.severity}) — {classificationLabel(m.classification)}
                        </li>
                      ))}
                  </ul>
                )}
                {scan.effective && (
                  <div role="note">
                    <p>
                      Originally <strong>{VERDICT_LABEL[scan.original.result]}</strong> — changed because of your
                      report{scan.corrections.length > 1 ? "s" : ""}:
                    </p>
                    <ul>
                      {scan.corrections.map((c) => (
                        <li key={c.id}>
                          {c.allergen ? `${c.allergen} ` : ""}
                          {CORRECTION_TYPE_LABEL[c.correctionType]}
                          {" — "}
                          {c.status === "corroborated" ? "corroborated" : "pending review"}
                          {c.note && ` — "${c.note}"`}
                        </li>
                      ))}
                    </ul>
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
