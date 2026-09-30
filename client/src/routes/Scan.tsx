import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/AuthContext";
import {
  ApiRequestError,
  combineLabelScan,
  createCorrection,
  createLabelScan,
  createScan,
  discardLabelEvidence,
  downscaleLabelPhoto,
  listProfiles,
  type CombineOutcome,
  type CorrectionType,
  type ProfileSummary,
  type ScanResult,
} from "../lib/api";
import { reportOutcomeMessage, yourReportLine } from "../lib/correctionCopy";
import { onlyUncheckedGaps, provenanceLine, uncheckedNote } from "../lib/evidenceCopy";

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

// Mirrors server/src/verdict/mergeVerdict.ts's own isTraceEscalatedToContains exactly — same rule,
// so the two never drift apart on what counts as "the label said 'may contain', the app treated it
// as unsafe" versus a genuine direct finding. communityReported is checked ahead of this at every
// call site below (never inside this function) — a corroborated community report is a different
// claim from a trace escalation, and the two are the one case this rule alone can't tell apart: a
// deterministic trace tag (source: "trace", aiEscalated: false) that a *community* report — not
// treatTracesAsUnsafe — later escalated to "contains" would otherwise read as a false positive here.
function isTraceEscalatedToContains(m: ScanResult["matched_allergens"][number]): boolean {
  if (m.classification !== "contains") return false;
  if (!m.aiEscalated) return m.source === "trace";
  return m.escalatedFromTrace === true;
}

function classificationLabel(m: ScanResult["matched_allergens"][number]): string {
  if (!m.communityReported && isTraceEscalatedToContains(m)) return 'label says "may contain"';
  if (m.classification === "contains") return "contains";
  if (m.classification === "unresolved") return "couldn't confirm from the label text";
  return "may contain traces";
}

function shopperCount(n: number): string {
  return n === 1 ? "1 shopper" : `${n} shoppers`;
}

// matchedText: the verbatim ingredient text the matcher hit (server matcher/match.ts). Absent on tag
// and trace matches, and on any scan stored before the matcher kept it.
type MatchedRow = ScanResult["matched_allergens"][number] & { matchedText?: string };

function sourceLabel(m: MatchedRow, scan: Pick<ScanResult, "source">): string {
  // docs/principles.md principle 7: a community report is a different claim from the label data,
  // and says so on the card rather than borrowing the label's authority.
  if (m.communityReported) {
    return `reported by ${shopperCount(m.communityReporterCount ?? 1)} with a label photo — not in the product data`;
  }
  // The label's own claim (a trace) and the app's decision (treat it as unsafe, because this
  // profile flags traces) are two separate statements — never collapse them into "contains", which
  // is a claim the label itself never made. Checked before the AI-escalated branch below, since a
  // trace escalation is very often AI-driven and would otherwise be caught by it first.
  if (isTraceEscalatedToContains(m)) return "treated as unsafe because this profile flags traces";
  // AI-escalated findings carry their own citedSpan rather than the deterministic source
  // (tag/ingredients/trace) — the deterministic matcher found nothing for these, that's exactly
  // why the AI reasoning step ran.
  if (m.aiEscalated) {
    return m.citedSpan ? `AI review — "${m.citedSpan}"` : "flagged by AI review";
  }
  // Where the claim came from, not the claim again — the claim line above already says what the
  // package claims (classificationLabel). One fact per line. A row came from the photographed label
  // on a photo scan, and on a combined scan when reconciliation took the label's side.
  const fromPhoto = scan.source === "label_photo" || (scan.source === "combined" && m.evidenceSource === "label");
  // Tags are structured data with no text behind them to quote — say where they are listed, and
  // never fill the slot with a quote the source didn't contain.
  if (m.source === "tag") return fromPhoto ? "listed on the label you photographed" : "listed on the product record";
  // The one source with real text: quote exactly what matched, so it can be found on the package.
  if (m.source === "ingredients") return m.matchedText ? `found in ingredient text — "${m.matchedText}"` : "found in ingredient text";
  if (m.source === "trace") {
    return fromPhoto ? "allergen warning on the label you photographed" : "allergen warning on the product record";
  }
  return "not found";
}

// Styling hooks only — which visual treatment a row gets. Each follows exactly the precedence
// classificationLabel/sourceLabel use for their words, so the look can never disagree with the text.
// "trace_unsafe" is kept apart from "contains" on purpose: the label only said "may contain", and
// this profile's trace rule is what made it unsafe — styling it as a plain "contains" would undo the
// distinction the copy was fixed to draw.
function rowClaim(scan: ScanResult, m: ScanResult["matched_allergens"][number]): string {
  if (reportedPresentByYou(scan, m.allergenName)) return "contains";
  if (!m.communityReported && isTraceEscalatedToContains(m)) return "trace_unsafe";
  return m.classification;
}

function rowSource(m: ScanResult["matched_allergens"][number]): "community" | "label" | "ai" {
  if (m.communityReported) return "community";
  if (isTraceEscalatedToContains(m)) return "label";
  if (m.aiEscalated) return "ai";
  return "label";
}

// Whether the viewer's own "this has an allergen the card didn't flag" report is what this row's
// "contains" rests on — applyUserCorrections (server) sets it straight to "contains" and leaves the
// row's original source alone, so the source can't say so itself. Not when the engine already said
// "contains": the label data is the stronger source, same call applyCommunityCorrections makes.
function reportedPresentByYou(scan: ScanResult, allergenName: string): boolean {
  const key = allergenName.toLowerCase();
  if (scan.matched_allergens.some((m) => m.allergenName.toLowerCase() === key && m.classification === "contains")) {
    return false;
  }
  return (scan.corrections ?? []).some((c) => c.direction === "add_caution" && c.allergen?.toLowerCase() === key);
}

// Combined scans only (docs/verdict-engine.md Path D). A disagreement is a claim about how this
// ALLERGEN's row was decided — separate from, and rendered below, whatever classificationLabel/
// sourceLabel already say about it, so the row reads as "here's the finding, and here's the part
// the two sources didn't agree on" rather than folding both into one sentence.
function disagreementNote(m: ScanResult["matched_allergens"][number]): string | null {
  if (m.disagreement === "label_stricter") {
    return "Not listed in the product database — this came from your photo.";
  }
  if (m.disagreement === "label_looser") {
    return "Listed in the product database, but your photo didn't show it.";
  }
  return null;
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
  // Set only by the disagreement row's own report link (docs/principles.md, Sept 27 2026) — every
  // other way of opening this form leaves it null, which the server already treats as
  // "user_initiated". Never inferred from reportType/reportAllergen: this is about how the report
  // was prompted, not what it claims.
  const [reportOrigin, setReportOrigin] = useState<"disagreement_prompt" | null>(null);

  // Path C (docs/verdict-engine.md) and the adaptive flow's combine step (Path D) share this one
  // capture form. "standalone" is the barcode-less entry point (createLabelScan, unchanged);
  // "combine" is a photo taken against the EXISTING barcode scan in `result` (combineLabelScan) —
  // required (evidence_decision.photo === "required") or offered (=== "prompted"). `result` is
  // deliberately NOT cleared when opening combine mode, unlike standalone — combineLabelScan needs
  // result.id, and the whole point of the adaptive flow is that the barcode identity survives.
  const [photoCaptureOpen, setPhotoCaptureOpen] = useState(false);
  const [photoCaptureMode, setPhotoCaptureMode] = useState<"standalone" | "combine">("standalone");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoReading, setPhotoReading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // required-photo is a strong default, never a trap: dismissing it renders the barcode-only card
  // (fail-closed — unable_to_confirm stands) instead of blocking the flow indefinitely.
  const [requiredPhotoDismissed, setRequiredPhotoDismissed] = useState(false);

  // "Discard this photo" — the one action left for a flagged identity mismatch
  // (docs/verdict-engine.md Path D). The mismatch itself is just result.identity_mismatch, rendered
  // inline on the verdict card; this is only the in-flight state for the discard request itself.
  const [discardingMismatch, setDiscardingMismatch] = useState(false);
  const [discardMismatchError, setDiscardMismatchError] = useState<string | null>(null);

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
    setReportOrigin(null);
    setPhotoCaptureOpen(false);
    setPhotoFile(null);
    setPhotoError(null);
    setRequiredPhotoDismissed(false);
    setDiscardingMismatch(false);
    setDiscardMismatchError(null);
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
      // "required" is the next mandatory step, not an offer — go straight into the capture form
      // rather than making the family read a barcode-only card first (docs/verdict-engine.md Path
      // D's decision rules; server/src/verdict/scanPlan.ts is the single source of this rule).
      if (scan.evidence_decision?.photo === "required") {
        setPhotoCaptureMode("combine");
        setPhotoCaptureOpen(true);
      }
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

  // The barcode-less entry point — always starts fresh, never carries a barcode forward. Every
  // scenario that used to carry a barcode into this same form (a barcode scan with missing/thin
  // data) now goes through openCombinePhotoCapture instead, which keeps the barcode's identity
  // intact rather than re-validating a client-remembered string.
  function openStandalonePhotoCapture() {
    resetForNewScan();
    setPhotoCaptureMode("standalone");
    setPhotoFile(null);
    setPhotoError(null);
    setPhotoCaptureOpen(true);
  }

  // Opened by the "required" auto-trigger in runScan, or by clicking the "prompted" offer below —
  // `result` is left exactly as it is; combineLabelScan reads its own barcode-side evidence back
  // off result.id rather than anything sent from here.
  function openCombinePhotoCapture() {
    setPhotoCaptureMode("combine");
    setPhotoFile(null);
    setPhotoError(null);
    setPhotoCaptureOpen(true);
  }

  function handlePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    setPhotoFile(event.target.files?.[0] ?? null);
  }

  // Applies a "combined" or "discarded" CombineOutcome to page state — shared by the initial combine
  // attempt and by discarding a flagged mismatch, since both can land on "combined" (an unreadable
  // photo is handled by its own caller directly, since it needs different UI: a form-level error,
  // not a card update).
  function applyCombineOutcome(outcome: CombineOutcome) {
    if (outcome.status === "combined") {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              source: "combined",
              result: outcome.result,
              confidence: outcome.confidence,
              matched_allergens: outcome.matched_allergens,
              explanation: outcome.explanation,
              evidence: outcome.evidence,
              extracted_text: outcome.extracted_text,
              extraction_legible: true,
              extraction_complete: true,
              effective: outcome.effective,
              community_reports: outcome.community_reports,
              evidence_decision: null,
              identity_mismatch: outcome.identity_mismatch,
            }
          : prev,
      );
    } else if (outcome.status === "discarded") {
      // Reverts to the scan's own pre-combine barcode-only verdict — the photo and its extracted
      // text are no longer part of what's shown, matching what a plain barcode scan looks like.
      setResult((prev) =>
        prev
          ? {
              ...prev,
              source: "barcode",
              result: outcome.result,
              confidence: outcome.confidence,
              matched_allergens: outcome.matched_allergens,
              explanation: outcome.explanation,
              evidence: undefined,
              extracted_text: undefined,
              extraction_legible: undefined,
              extraction_complete: undefined,
              effective: outcome.effective,
              community_reports: outcome.community_reports,
              evidence_decision: null,
              identity_mismatch: null,
            }
          : prev,
      );
    }
  }

  async function handlePhotoSubmit(event: FormEvent) {
    event.preventDefault();
    setPhotoError(null);

    if (!photoFile) {
      setPhotoError("Choose a photo of the ingredients panel first.");
      return;
    }

    setPhotoReading(true);
    try {
      const downscaled = await downscaleLabelPhoto(photoFile);

      if (photoCaptureMode === "combine") {
        if (!result) return; // Not reachable — combine mode only opens with a result on screen.
        const outcome = await combineLabelScan(result.id, downscaled);
        if (outcome.status === "unreadable") {
          // Genuinely dry: nothing was written to the scan, so stay on this same form and let the
          // family try again immediately rather than dropping them into a dead-end screen.
          setPhotoError(outcome.explanation);
          return;
        }
        applyCombineOutcome(outcome);
        setPhotoCaptureOpen(false);
        setPhotoFile(null);
      } else {
        const scan = await createLabelScan(profileId, downscaled);
        setPhotoCaptureOpen(false);
        setPhotoFile(null);
        setResult(scan);
      }
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

  async function discardMismatch() {
    if (!result?.identity_mismatch) return;
    setDiscardingMismatch(true);
    setDiscardMismatchError(null);
    try {
      const outcome = await discardLabelEvidence(result.identity_mismatch.extraction_id);
      applyCombineOutcome(outcome);
    } catch {
      setDiscardMismatchError("Couldn't discard that — try again.");
    } finally {
      setDiscardingMismatch(false);
    }
  }

  function openDisagreementReport(allergenName: string) {
    setReportOpen(true);
    setReportType("flag_wrong");
    setReportAllergen(allergenName);
    setReportOrigin("disagreement_prompt");
    setReportOutcome(null);
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
        origin: reportOrigin ?? undefined,
      });
      setReportOutcome(
        reportOutcomeMessage({
          correctionType: reportType,
          corroborated: outcome.corroborated,
          reachesOtherFamilies: outcome.reaches_other_families,
          hasBarcode: result.barcode !== null,
        }),
      );
      // CONTEST_RULES.md §3: the report overrides this person's own view immediately — so the card
      // they're still looking at shows it, not the verdict they just said was wrong. The server
      // returns the same corrected view scan history shows; the engine's own verdict stays in
      // result.result and the callout below names what changed it.
      setResult((prev) =>
        prev
          ? { ...prev, effective: outcome.effective, community_reports: outcome.community_reports, corrections: outcome.corrections }
          : prev,
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

  // "required" and not yet resolved (photo not yet taken, and the family hasn't explicitly said
  // "I don't have this in front of me") — no card renders at all; the capture form IS the screen.
  const awaitingRequiredPhoto =
    result?.source === "barcode" && result.evidence_decision?.photo === "required" && !requiredPhotoDismissed;

  // Offered, not required — a "prompted" second opinion (severe allergen), or a required photo the
  // family explicitly deferred. Either way the card already renders in full; this only adds a box
  // beneath the findings, never blocking anything.
  const offerPhoto =
    result?.source === "barcode" &&
    !photoCaptureOpen &&
    (result.evidence_decision?.photo === "prompted" || (result.evidence_decision?.photo === "required" && requiredPhotoDismissed));

  const couldntReadLabel =
    result !== null &&
    (result.source === "label_photo" || result.source === "combined") &&
    (result.extraction_legible === false || result.extraction_complete === false);

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
              <button type="button" onClick={openStandalonePhotoCapture}>
                No barcode? Photograph the label
              </button>
            </p>
          )}

          {photoCaptureOpen && (
            <form onSubmit={handlePhotoSubmit}>
              <h2>Photograph the ingredients label</h2>
              {photoCaptureMode === "combine" &&
                result?.evidence_decision?.photo === "required" &&
                // Missing data: the server's explanation already says which case — barcode unknown,
                // or product known with no ingredient data (principle 2). Thin data keeps the
                // general line, since the record does exist and does say something.
                (result.evidence_decision.reason === "missing_data" && result.explanation ? (
                  <p>{result.explanation} A photo of the ingredients panel is the next step.</p>
                ) : (
                  <p>
                    The barcode alone doesn't have enough data to check this — a photo of the ingredients panel is
                    the next step.
                  </p>
                ))}
              {photoCaptureMode === "combine" && result?.evidence_decision?.photo === "prompted" && (
                <p>
                  This profile has a severe allergen on file. The barcode data looks fine, but a photo of the label
                  gives a second opinion.
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
                  // A required photo can always be deferred — it never traps the family in this
                  // form. Declining just means the barcode-only, already fail-closed result stands.
                  if (photoCaptureMode === "combine" && result?.evidence_decision?.photo === "required") {
                    setRequiredPhotoDismissed(true);
                  }
                }}
              >
                {photoCaptureMode === "combine" && result?.evidence_decision?.photo === "required"
                  ? "I don't have this in front of me"
                  : "Cancel"}
              </button>
            </form>
          )}

        </>
      )}

      {couldntReadLabel && (
        // Couldn't-read state (docs/verdict-engine.md Path C plan §5): covers an unreadable photo,
        // an extraction call failure, and an incomplete read (the ingredients statement was cut
        // off) uniformly — the server already picked the right distinct copy for whichever of
        // those happened; this just offers a retake rather than rendering a verdict card that has
        // nothing real to show. Standalone Path C only — a combine-mode unreadable read never
        // reaches this state at all, since it's a form-level error on the still-open capture form.
        <section>
          <h2>Couldn't read that label</h2>
          <p role="alert">{result!.explanation}</p>
          <button type="button" onClick={openStandalonePhotoCapture}>
            Try again
          </button>
        </section>
      )}

      {result && shown && !awaitingRequiredPhoto && !couldntReadLabel && (
        <section>
          <div className="verdict-card" data-verdict={shown.result}>
          {/* 1. THE VERDICT — the single word this whole screen exists to deliver, first. */}
          <header className="verdict-card__header">
            <h2>{VERDICT_LABEL[shown.result]}</h2>
            <p className="verdict-card__product">
              {result.product_name ?? "Unknown product"}
              {result.product_brand && ` — ${result.product_brand}`}
            </p>
          </header>

          <div className="verdict-card__body">

          {result.identity_mismatch && (
            <p role="note">
              The label you photographed reads as a different product. We've kept your barcode
              result and flagged what the label said.
              <details>
                <summary>What we read from your photo</summary>
                <p>
                  Product on file: <strong>{result.identity_mismatch.off_product_name ?? "no name on file"}</strong>
                  <br />
                  Label read: <strong>{result.identity_mismatch.extracted_product_name ?? "no product name found"}</strong>
                </p>
              </details>
              {discardMismatchError && <p role="alert">{discardMismatchError}</p>}
              <button type="button" disabled={discardingMismatch} onClick={discardMismatch}>
                That wasn't this product — discard the photo
              </button>
            </p>
          )}

          {/* 2. REAL FINDINGS — the explanation sentence and the per-allergen rows. What justifies
              the headline and what to actually check against the box in your hand. */}
          {/* Omitted when it's only the generic "some allergens couldn't be checked" sentence — the
              grouped note below says the same thing with the count and names. One of the two had
              to go on a card read in three seconds in an aisle. */}
          {result.explanation &&
            !(onlyUncheckedGaps(result.matched_allergens) && shown.matched_allergens.some((m) => m.classification === "unchecked")) && (
              <p>{result.explanation}</p>
            )}

          {shown.matched_allergens.filter((m) => m.classification !== "clear" && m.classification !== "unchecked").length >
            0 && (
            <ul className="allergen-rows">
              {shown.matched_allergens
                .filter((m) => m.classification !== "clear" && m.classification !== "unchecked")
                .map((m) => (
                  // Four facts per row, each on its own visual line: which allergen, how severe for
                  // this profile, what the package claims, and how we know. The "(" ")" and " — "
                  // separators stay in the DOM, visually hidden, so a screen reader hears the row
                  // exactly as the one-line version read.
                  <li key={m.allergenName} className="allergen-row" data-claim={rowClaim(result, m)}>
                    <span className="allergen-row__head">
                      <strong className="allergen-row__name">{m.allergenName}</strong>{" "}
                      <span className="allergen-row__severity" data-severity={m.severity}>
                        <span className="visually-hidden">(</span>
                        {m.severity}
                        <span className="visually-hidden">)</span>
                      </span>
                    </span>
                    <span className="visually-hidden"> — </span>
                    {/* Checked ahead of both labels, like communityReported: the row kept its
                        original source, which would otherwise read as "not found" or as the
                        label's own "may contain" — neither is what made it "contains". */}
                    {reportedPresentByYou(result, m.allergenName) ? (
                      <>
                        <span className="allergen-row__claim">contains</span>
                        <span className="visually-hidden"> — </span>
                        <span className="allergen-row__source" data-source="you">
                          your report, with a photo of the label
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="allergen-row__claim">{classificationLabel(m)}</span>
                        <span className="visually-hidden"> — </span>
                        <span className="allergen-row__source" data-source={rowSource(m)}>
                          {sourceLabel(m, result)}
                        </span>
                      </>
                    )}
                    {disagreementNote(m) && (
                      <p role="note">
                        {disagreementNote(m)}
                        {m.disagreement === "label_looser" && (
                          <>
                            {" "}
                            <button type="button" onClick={() => openDisagreementReport(m.allergenName)}>
                              Check the package — report if it's not listed
                            </button>
                          </>
                        )}
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          )}

          {/* 3. DISAGREEMENT — loud, but strictly after the verdict and its findings: the headline
              is still what to act on, this says why it's worth a second look at the specific rows
              above before deciding. */}
          {shown.matched_allergens.some((m) => m.disagreement) && (
            <p role="alert">
              <strong>Your photo and the product database don't fully agree</strong> — see the notes above before
              deciding.
            </p>
          )}

          {(() => {
            // "unchecked" allergens (Path C only) render as one grouped line, not a row each.
            // JT's call: in-store, one-handed, on a phone — six near-identical rows bury a real
            // finding and train people to skim. Nothing is hidden; every name is still listed, just
            // together, with the "why" said once instead of once per row.
            const unchecked = shown.matched_allergens.filter((m) => m.classification === "unchecked");
            if (unchecked.length === 0) return null;
            const note = uncheckedNote({
              names: unchecked.map((m) => m.allergenName.toLowerCase()),
              profileLabel: profiles.find((p) => p.id === profileId)?.label ?? null,
              leadsCard: onlyUncheckedGaps(shown.matched_allergens),
            });
            return <p role="note">{note}</p>;
          })()}

          {/* 5. PROMPTS — an offered second opinion, never required reading to understand the
              verdict above. */}
          {offerPhoto && (
            <p>
              {result.evidence_decision?.photo === "required" ? (
                <>We couldn't check this against a photo yet. </>
              ) : (
                <>This profile has a severe allergen on file — for extra confidence, </>
              )}
              <button type="button" onClick={openCombinePhotoCapture}>
                Photograph the ingredients label
              </button>
            </p>
          )}

          {/* 6. PROVENANCE — where the evidence came from, and the reference material for checking
              it yourself. Comes last: it doesn't change what to decide, only how the decision was
              reached. */}
          {(() => {
            const provenance = provenanceLine(result);
            if (!provenance) return null;
            return (
              <p role="note" className="verdict-card__provenance">
                <strong>{provenance.heading}</strong>
                {provenance.detail}
              </p>
            );
          })()}

          {(result.source === "label_photo" || result.source === "combined") && result.extracted_text && (
            <details className="verdict-card__label-read">
              <summary>What we read from your photo — check it against the package</summary>
              <p>{result.extracted_text}</p>
            </details>
          )}

          {result.effective && (
            <div role="note">
              <p>
                The product data alone says <strong>{VERDICT_LABEL[result.result]}</strong>. Changed by{" "}
                {result.corrections?.length ? "your report" : "shopper reports"}
                {result.corrections?.length && result.community_reports.length ? " and shopper reports" : ""}, each with a
                photo of the label:
              </p>
              <ul>
                {result.corrections?.map((c) => (
                  <li key={c.id}>{yourReportLine(c)}</li>
                ))}
                {result.community_reports.map((r) => (
                  <li key={r.allergenName}>
                    {r.allergenName} — reported present by {shopperCount(r.reporterCount)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p role="note" className="verdict-card__disclaimer">
            {DISCLAIMER}
          </p>
          </div>
          </div>

          {/* Directly under the card it disputes — never at the foot of the page. */}
          {reportOutcome && <p role="status">{reportOutcome}</p>}

          {!reportOutcome && (
            <>
              {reportOpen ? (
                <form onSubmit={handleReportSubmit} className="verdict-report">
                  <h3>Report a problem with this verdict</h3>
                  {reportOrigin === "disagreement_prompt" && (
                    // Grounds the report in the parent's own reading of the package, not in the
                    // photo's silence — a photo that shows nothing can't be the evidence for
                    // removing a warning (docs/principles.md, Sept 27 2026); the parent's own
                    // attestation can.
                    <p>
                      Check the package itself — if <strong>{reportAllergen}</strong> genuinely isn't listed there,
                      tell us.
                    </p>
                  )}
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
                            claim they're making. flag_wrong disputes an allergen the card actually
                            claimed present (contains/caution); flag_missing is for anything that
                            didn't claim presence at all (clear, unresolved, unchecked) — "this isn't
                            actually in it" doesn't make sense against an allergen nothing claimed
                            was there in the first place, which is exactly the mistake offering
                            "unresolved" or "unchecked" on the flag_wrong side would invite. */}
                        {shown.matched_allergens
                          .filter((m) =>
                            reportType === "flag_wrong"
                              ? m.classification === "contains" || m.classification === "caution"
                              : m.classification === "clear" ||
                                m.classification === "unresolved" ||
                                m.classification === "unchecked",
                          )
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
                <button
                  type="button"
                  className="verdict-report__open"
                  onClick={() => {
                    setReportOpen(true);
                    setReportOrigin(null);
                  }}
                >
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
