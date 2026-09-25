import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/AuthContext";
import {
  ApiRequestError,
  createCorrection,
  createLabelScan,
  createScan,
  downscaleLabelPhoto,
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

function shopperCount(n: number): string {
  return n === 1 ? "1 shopper" : `${n} shoppers`;
}

function sourceLabel(m: ScanResult["matched_allergens"][number]): string {
  // docs/principles.md principle 7: a community report is a different claim from the label data,
  // and says so on the card rather than borrowing the label's authority.
  if (m.communityReported) {
    return `reported by ${shopperCount(m.communityReporterCount ?? 1)} with a label photo — not in the product data`;
  }
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
  const { labelScanEnabled } = useAuth();
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

  // Path C (docs/verdict-engine.md) — photograph the ingredients label instead of/after a barcode.
  // photoCarryBarcode is set only by the reactive entry point (a barcode scan came back
  // unable_to_confirm); the standalone "no barcode" entry point leaves it null. Either way the
  // server re-validates it — this is just what the UI remembers to offer back.
  const [photoCaptureOpen, setPhotoCaptureOpen] = useState(false);
  const [photoCarryBarcode, setPhotoCarryBarcode] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoReading, setPhotoReading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

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

  // Shared between the barcode flow and the photo flow — clears whatever the other one left behind
  // so switching between them never shows stale state.
  function resetForNewScan() {
    setError(null);
    setResult(null);
    setReportOpen(false);
    setReportAllergen("");
    setReportNote("");
    setReportPhoto(null);
    setReportError(null);
    setReportOutcome(null);
    setPhotoCaptureOpen(false);
    setPhotoFile(null);
    setPhotoError(null);
  }

  // Manual entry and the camera both end up here — same validation, same request, same rendering.
  async function runScan(rawBarcode: string, targetProfileId: string) {
    resetForNewScan();

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

  // Standalone entry point ("No barcode? Photograph the label") or the reactive one (offered after
  // an unable_to_confirm barcode scan) both open the same capture UI — carryBarcode is null for the
  // former, the searched barcode for the latter. The server re-validates it either way.
  function openPhotoCapture(carryBarcode: string | null) {
    resetForNewScan();
    setPhotoCarryBarcode(carryBarcode);
    setPhotoCaptureOpen(true);
  }

  function handlePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    setPhotoFile(event.target.files?.[0] ?? null);
  }

  async function handlePhotoSubmit(event: FormEvent) {
    event.preventDefault();
    setPhotoError(null);

    if (!profileId) {
      setPhotoError("Pick who you're scanning for.");
      return;
    }
    if (!photoFile) {
      setPhotoError("Choose a photo of the ingredients panel first.");
      return;
    }

    setPhotoReading(true);
    try {
      const downscaled = await downscaleLabelPhoto(photoFile);
      const scan = await createLabelScan(profileId, downscaled, photoCarryBarcode ?? undefined);
      setPhotoCaptureOpen(false);
      setPhotoFile(null);
      setResult(scan);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 400 && err.message === "photo_too_large") {
        setPhotoError("That photo is too large — try a smaller image.");
      } else if (err instanceof ApiRequestError && err.status === 400 && err.message === "invalid_file_type") {
        setPhotoError("That doesn't look like a photo — please choose a JPEG, PNG, or WebP image.");
      } else {
        setPhotoError("Couldn't read that photo. Try again.");
      }
    } finally {
      setPhotoReading(false);
    }
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
          : result.barcode === null
            ? "Reported — thanks. This is recorded against your own view; without a barcode we can't check it " +
              "against anyone else's report of the same product."
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

  // The engine's own verdict unless a corroborated community report escalated it. Both are always
  // on the card: the headline is what to act on, the note under it says what changed it.
  const shown = result && (result.effective ?? { result: result.result, matched_allergens: result.matched_allergens });

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

          {labelScanEnabled && !photoCaptureOpen && (
            <p>
              <button type="button" onClick={() => openPhotoCapture(null)}>
                No barcode? Photograph the label
              </button>
            </p>
          )}

          {photoCaptureOpen && (
            <form onSubmit={handlePhotoSubmit}>
              <h2>Photograph the ingredients label</h2>
              {photoCarryBarcode && (
                <p>
                  We couldn't find enough data for barcode {photoCarryBarcode} — a photo of the ingredients panel can
                  still tell us what's in it.
                </p>
              )}
              <label>
                Photo of the ingredients panel
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoFileChange} required />
              </label>
              {photoError && <p role="alert">{photoError}</p>}
              <button type="submit" disabled={photoReading}>
                {photoReading ? "Reading the label…" : "Read this label"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhotoCaptureOpen(false);
                  setPhotoFile(null);
                  setPhotoError(null);
                }}
              >
                Cancel
              </button>
            </form>
          )}
        </>
      )}

      {result && shown && result.source === "label_photo" && (result.extraction_legible === false || result.extraction_complete === false) && (
        // Couldn't-read state (docs/verdict-engine.md Path C plan §5): covers an unreadable photo,
        // an extraction call failure, and an incomplete read (the ingredients statement was cut
        // off) uniformly — the server already picked the right distinct copy for whichever of
        // those happened; this just offers a retake rather than rendering a verdict card that has
        // nothing real to show.
        <section>
          <h2>Couldn't read that label</h2>
          <p role="alert">{result.explanation}</p>
          <button type="button" onClick={() => openPhotoCapture(result.barcode)}>
            Try again
          </button>
        </section>
      )}

      {result &&
        shown &&
        !(result.source === "label_photo" && (result.extraction_legible === false || result.extraction_complete === false)) && (
        <section>
          <h2>{VERDICT_LABEL[shown.result]}</h2>
          {result.source === "label_photo" && (
            <p role="note">
              <strong>From a photographed label</strong> — read by AI, not confirmed against the manufacturer's own
              data.
            </p>
          )}
          <p>
            {result.product_name ?? "Unknown product"}
            {result.product_brand && ` — ${result.product_brand}`}
          </p>

          {result.explanation && <p>{result.explanation}</p>}

          {result.source === "label_photo" && result.extracted_text && (
            <details open>
              <summary>What we read from your photo — check it against the package</summary>
              <p>{result.extracted_text}</p>
            </details>
          )}

          {shown.matched_allergens.length > 0 && (
            <ul>
              {shown.matched_allergens
                .filter((m) => m.classification !== "clear")
                .map((m) => (
                  <li key={m.allergenName}>
                    <strong>{m.allergenName}</strong> ({m.severity}) — {classificationLabel(m)} — {sourceLabel(m)}
                  </li>
                ))}
            </ul>
          )}

          {result.effective && (
            <div role="note">
              <p>
                The product data alone says <strong>{VERDICT_LABEL[result.result]}</strong>. Changed by shopper reports,
                each with a photo of the label:
              </p>
              <ul>
                {result.community_reports.map((r) => (
                  <li key={r.allergenName}>
                    {r.allergenName} — reported present by {shopperCount(r.reporterCount)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p role="note">{DISCLAIMER}</p>

          {labelScanEnabled && shown.result === "unable_to_confirm" && result.source === "barcode" && (
            // Reactive entry point (docs/verdict-engine.md Path C plan §1): offered only for a
            // barcode scan that came back unable_to_confirm, not on a scan that already came from a
            // photo — a photo-sourced unable_to_confirm gets its own couldn't-read state instead.
            // Gated by labelScanEnabled (server env.labelScan, carried on /me) so this is never
            // offered when the server would just 404 the resulting request.
            <p>
              <button type="button" onClick={() => openPhotoCapture(result.barcode)}>
                Photograph the ingredients label instead
              </button>
            </p>
          )}

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
                        {shown.matched_allergens
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
