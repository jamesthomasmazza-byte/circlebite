import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { createScan, listProfiles, type ProfileSummary, type ScanResult } from "../lib/api";

const VERDICT_LABEL: Record<ScanResult["result"], string> = {
  safe: "Safe",
  contains_allergen: "Contains an allergen",
  may_contain_caution: "May contain — caution",
  unable_to_confirm: "Unable to confirm",
};

// Exact wording from docs/verdict-engine.md §"non-negotiables" — renders on every verdict card,
// unconditionally, not just when something matched.
const DISCLAIMER =
  "This is a screening aid, not a guarantee — always check the physical label, especially for “may contain” warnings.";

function sourceLabel(source: ScanResult["matched_allergens"][number]["source"]): string {
  if (source === "tag") return "listed ingredient";
  if (source === "ingredients") return "found in ingredient text";
  if (source === "trace") return "may contain traces";
  return "not found";
}

export function Scan() {
  const [searchParams] = useSearchParams();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profileId, setProfileId] = useState(searchParams.get("profile") ?? "");
  const [barcode, setBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    listProfiles()
      .then((res) => {
        const all = [...res.managed, ...res.followed];
        setProfiles(all);
        setProfileId((current) => current || all[0]?.id || "");
      })
      .catch(() => setError("Couldn't load your profiles. Try reloading the page."))
      .finally(() => setLoadingProfiles(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!profileId) {
      setError("Pick who you're scanning for.");
      return;
    }
    if (!/^\d{6,14}$/.test(barcode.trim())) {
      setError("That doesn't look like a barcode — digits only, 6 to 14 of them.");
      return;
    }

    setSubmitting(true);
    try {
      const scan = await createScan(profileId, barcode.trim());
      setResult(scan);
    } catch {
      setError("Couldn't complete that scan. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProfiles) return <p>Loading…</p>;

  return (
    <main>
      <p>
        <Link to="/dashboard">← Dashboard</Link>
      </p>
      <h1>Scan a product</h1>

      {profiles.length === 0 ? (
        <p>
          You don't have any profiles to scan for yet. <Link to="/profiles">Create one</Link> first.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Scanning for
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Barcode
            <input
              inputMode="numeric"
              placeholder="e.g. 3017620422003"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Checking…" : "Check this product"}
          </button>
        </form>
      )}

      {result && (
        <section>
          <h2>{VERDICT_LABEL[result.result]}</h2>
          <p>
            {result.product_name ?? "Unknown product"}
            {result.product_brand && ` — ${result.product_brand}`}
          </p>

          {result.matched_allergens.length > 0 && (
            <ul>
              {result.matched_allergens
                .filter((m) => m.classification !== "clear")
                .map((m) => (
                  <li key={m.allergenName}>
                    <strong>{m.allergenName}</strong> ({m.severity}) —{" "}
                    {m.classification === "contains" ? "contains" : "may contain traces"} — {sourceLabel(m.source)}
                  </li>
                ))}
            </ul>
          )}

          <p role="note">{DISCLAIMER}</p>
        </section>
      )}
    </main>
  );
}
