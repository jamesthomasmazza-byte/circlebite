import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState, type FormEvent } from "react";
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

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

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

  // Manual entry and the camera both end up here — same validation, same request, same rendering.
  async function runScan(rawBarcode: string, targetProfileId: string) {
    setError(null);
    setResult(null);

    if (!targetProfileId) {
      setError("Pick who you're scanning for.");
      return;
    }
    if (!/^\d{6,14}$/.test(rawBarcode.trim())) {
      setError("That doesn't look like a barcode — digits only, 6 to 14 of them.");
      return;
    }

    setSubmitting(true);
    try {
      const scan = await createScan(targetProfileId, rawBarcode.trim());
      setResult(scan);
    } catch {
      setError("Couldn't complete that scan. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await runScan(barcode, profileId);
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
  }

  async function startCamera() {
    setCameraError(null);
    setCameraActive(true);
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (detected) => {
        if (!detected) return;
        const text = detected.getText();
        setBarcode(text);
        stopCamera();
        void runScan(text, profileId);
      });
      controlsRef.current = controls;
    } catch {
      // No camera device, permission denied, or an insecure context — manual entry stays
      // available either way, so this is a soft failure, not a page-level error.
      setCameraError("Couldn't access the camera. You can still enter the barcode by hand below.");
      setCameraActive(false);
    }
  }

  // Stop the camera on unmount so it doesn't keep the device open after navigating away.
  useEffect(() => () => controlsRef.current?.stop(), []);

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
        <>
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

          <section>
            {/* Always mounted, visibility toggled by CSS rather than conditional rendering — a
                conditionally-rendered <video> wouldn't exist in the DOM yet when startCamera() reads
                videoRef.current synchronously (before the setCameraActive(true) re-render happens),
                so zxing would silently fall back to an off-screen video element and the user would
                never see a feed even though decoding still technically worked. */}
            <video
              ref={videoRef}
              style={{ width: "100%", maxWidth: 400, display: cameraActive ? "block" : "none" }}
              muted
              playsInline
            />
            {cameraActive ? (
              <p>
                <button type="button" onClick={stopCamera}>
                  Stop camera
                </button>
              </p>
            ) : (
              <p>
                <button type="button" onClick={startCamera}>
                  Scan with camera
                </button>
              </p>
            )}
            {cameraError && <p role="alert">{cameraError}</p>}
          </section>

          <form onSubmit={handleSubmit}>
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
        </>
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
