import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  ApiRequestError,
  createCorrection,
  createScan,
  listProfiles,
  type CorrectionType,
  type ProfileSummary,
  type ScanResult,
} from "../lib/api";

const CORRECTION_TYPE_LABEL: Record<CorrectionType, string> = {
  flag_wrong: "This allergen isn't actually in this product",
  flag_missing: "This product has an allergen the card didn't flag",
  wrong_product: "This is the wrong product entirely",
};

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

function classificationLabel(m: ScanResult["matched_allergens"][number]): string {
  if (m.classification === "contains") return "contains";
  if (m.classification === "unresolved") return "couldn't confirm from the label text";
  return "may contain traces";
}

function sourceLabel(m: ScanResult["matched_allergens"][number]): string {
  // AI-escalated findings carry their own citedSpan rather than the deterministic source
  // (tag/ingredients/trace) — the deterministic matcher found nothing for these, that's exactly
  // why the AI reasoning step ran.
  if (m.aiEscalated) {
    return m.citedSpan ? `AI review — "${m.citedSpan}"` : "flagged by AI review";
  }
  if (m.source === "tag") return "listed ingredient";
  if (m.source === "ingredients") return "found in ingredient text";
  if (m.source === "trace") return "may contain traces";
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

  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<CorrectionType>("flag_wrong");
  const [reportAllergen, setReportAllergen] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportPhoto, setReportPhoto] = useState<File | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportOutcome, setReportOutcome] = useState<string | null>(null);

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
    setReportOpen(false);
    setReportAllergen("");
    setReportNote("");
    setReportPhoto(null);
    setReportError(null);
    setReportOutcome(null);

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

  async function handleReportSubmit(event: FormEvent) {
    event.preventDefault();
    if (!result) return;

    setReportError(null);
    if (!reportPhoto) {
      setReportError("A photo of the physical label is required.");
      return;
    }
    if (reportType !== "wrong_product" && !reportAllergen) {
      setReportError("Pick which allergen this is about.");
      return;
    }

    setReportSubmitting(true);
    try {
      const outcome = await createCorrection(result.id, {
        correctionType: reportType,
        allergen: reportType === "wrong_product" ? null : reportAllergen,
        note: reportNote.trim() || null,
        photo: reportPhoto,
      });
      setReportOutcome(
        outcome.corroborated
          ? "Reported — enough other reports agreed that this is now corroborated."
          : "Reported — thanks. This is now in the review queue.",
      );
      setReportOpen(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 400 && err.message === "photo_too_large") {
        setReportError("That photo is too large — try a smaller image.");
      } else if (err instanceof ApiRequestError && err.status === 400 && err.message === "invalid_file_type") {
        setReportError("That doesn't look like a photo — please attach a JPEG, PNG, or WebP image.");
      } else {
        setReportError("Couldn't submit that report. Try again.");
      }
    } finally {
      setReportSubmitting(false);
    }
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

          {result.explanation && <p>{result.explanation}</p>}

          {result.matched_allergens.length > 0 && (
            <ul>
              {result.matched_allergens
                .filter((m) => m.classification !== "clear")
                .map((m) => (
                  <li key={m.allergenName}>
                    <strong>{m.allergenName}</strong> ({m.severity}) — {classificationLabel(m)} — {sourceLabel(m)}
                  </li>
                ))}
            </ul>
          )}

          <p role="note">{DISCLAIMER}</p>

          {reportOutcome && <p role="status">{reportOutcome}</p>}

          {!reportOutcome && (
            <>
              {reportOpen ? (
                <form onSubmit={handleReportSubmit}>
                  <h3>Report a problem with this verdict</h3>
                  <fieldset>
                    <legend>What's wrong?</legend>
                    {(Object.keys(CORRECTION_TYPE_LABEL) as CorrectionType[]).map((type) => (
                      <label key={type}>
                        <input
                          type="radio"
                          name="correctionType"
                          value={type}
                          checked={reportType === type}
                          onChange={() => {
                            setReportType(type);
                            setReportAllergen("");
                          }}
                        />
                        {CORRECTION_TYPE_LABEL[type]}
                      </label>
                    ))}
                  </fieldset>

                  {reportType !== "wrong_product" && (
                    <label>
                      Which allergen?
                      <select value={reportAllergen} onChange={(e) => setReportAllergen(e.target.value)} required>
                        <option value="" disabled>
                          Choose one
                        </option>
                        {/* Scoped to what this card actually shows — never an allergen the viewer
                            can't see, and never a picker offering the wrong direction for the
                            claim they're making. */}
                        {result.matched_allergens
                          .filter((m) => (reportType === "flag_wrong" ? m.classification !== "clear" : m.classification === "clear"))
                          .map((m) => (
                            <option key={m.allergenName} value={m.allergenName}>
                              {m.allergenName}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}

                  <label>
                    Photo of the physical label (required)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setReportPhoto(e.target.files?.[0] ?? null)}
                      required
                    />
                  </label>

                  <label>
                    Notes (optional)
                    <textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
                  </label>

                  {reportError && <p role="alert">{reportError}</p>}

                  <button type="submit" disabled={reportSubmitting}>
                    {reportSubmitting ? "Submitting…" : "Submit report"}
                  </button>
                  <button type="button" onClick={() => setReportOpen(false)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => setReportOpen(true)}>
                  Report a problem with this verdict
                </button>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
