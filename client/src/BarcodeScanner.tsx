import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

import { BoxRegionReader } from "./boxRegionReader";
import { CAMERA_PRIMER_HEADING, CAMERA_PRIMER_LINE, cameraPrimerSeen, markCameraPrimerSeen } from "./lib/cameraPrimer";
import { NO_READ_OFFER, NO_READ_OFFER_MS } from "./lib/scannerCopy";

// How long "Got it" shows on the box before the camera stops and the scan runs.
const READ_CONFIRM_MS = 250;

/**
 * The camera scanner, moved out of Scan.tsx (2026-10-24) with a target box over the preview: an
 * outlined box with the view dimmed outside it, and "Line up the barcode inside the box" under it.
 *
 * With `region` off (SCANNER_REGION, lib/scannerRegion.ts) the box is a guide only: the plain reader
 * decodes the whole frame, so a barcode outside the box can still read. With it on (2026-10-27),
 * BoxRegionReader decodes only inside the box, plus a small allowance. Only which reader is
 * created differs; the camera is opened and stopped the same way either way.
 *
 * On a read, the box goes solid with "Got it" (and a short buzz where the phone supports it) for a
 * quarter second, then the camera stops and onDetected runs — the same order as before.
 *
 * With onOfferLabelPhoto, a camera that has read nothing for NO_READ_OFFER_MS offers the label
 * photo under the hint, while it keeps running (2026-10-26). Only a tap takes it: the camera stops
 * and onOfferLabelPhoto runs. A read after the offer shows still goes through as usual.
 */
export function BarcodeScanner({
  onDetected,
  onOfferLabelPhoto,
  region = false,
}: {
  onDetected: (text: string) => void;
  onOfferLabelPhoto?: () => void;
  region?: boolean;
}) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [offerShown, setOfferShown] = useState(false);
  // The one sentence before this device's first camera use (lib/cameraPrimer.ts), ahead of
  // startCamera and the system prompt — nothing in the camera code changes.
  const [primerOpen, setPrimerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // zxing calls back once per decoded frame; only the first read counts.
  const readRef = useRef(false);
  // The latest callback, not the one from when the camera started — the profile picked can change.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
    setRead(false);
  }

  async function startCamera() {
    setCameraError(null);
    setRead(false);
    readRef.current = false;
    setCameraActive(true);
    try {
      const reader = region
        ? new BoxRegionReader(() =>
            videoRef.current && boxRef.current ? { video: videoRef.current, box: boxRef.current } : null,
          )
        : new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (detected) => {
        if (!detected || readRef.current) return;
        readRef.current = true;
        const text = detected.getText();
        setRead(true);
        navigator.vibrate?.(50);
        window.setTimeout(() => {
          stopCamera();
          onDetectedRef.current(text);
        }, READ_CONFIRM_MS);
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

  // Bring the preview, hint and buttons into view above the tab bar — in a landscape phone the bar
  // takes a fifth of the height. After the render that shows them (2026-10-26): called from
  // startCamera it ran while the page was still too short to scroll, so with Scan's notices above,
  // Stop camera stayed under the bar.
  useEffect(() => {
    if (cameraActive) containerRef.current?.scrollIntoView({ block: "start" });
  }, [cameraActive]);

  // And again once the video knows its size (2026-10-27). Until its first frame it has no height,
  // so with a tall portrait frame (as iOS sends) the scroll above ran on a page too short to reach
  // the buttons, and Stop camera and the offer stayed under the tab bar. "resize" also catches the
  // frame changing shape when the phone turns.
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraActive || !video) return;
    const scroll = () => containerRef.current?.scrollIntoView({ block: "start" });
    video.addEventListener("loadedmetadata", scroll);
    video.addEventListener("resize", scroll);
    return () => {
      video.removeEventListener("loadedmetadata", scroll);
      video.removeEventListener("resize", scroll);
    };
  }, [cameraActive]);

  // The offer's timer, apart from the camera code: it runs while the camera does and nothing has
  // read, and starts over each time the camera starts.
  const offerEnabled = onOfferLabelPhoto !== undefined;
  useEffect(() => {
    setOfferShown(false);
    if (!offerEnabled || !cameraActive || read) return;
    const timer = window.setTimeout(() => setOfferShown(true), NO_READ_OFFER_MS);
    return () => window.clearTimeout(timer);
  }, [offerEnabled, cameraActive, read]);

  return (
    <section ref={containerRef} className="scanner-section">
      {/* Always mounted, visibility toggled by CSS rather than conditional rendering — a
          conditionally-rendered <video> wouldn't exist in the DOM yet when startCamera() reads
          videoRef.current synchronously (before the setCameraActive(true) re-render happens),
          so zxing would silently fall back to an off-screen video element and the user would
          never see a feed even though decoding still technically worked. */}
      <div className="scanner" data-active={cameraActive} data-read={read}>
        <video ref={videoRef} className="scanner__video" muted playsInline />
        {cameraActive && (
          <div ref={boxRef} className="scanner__box" aria-hidden="true">
            {read && <span className="scanner__got-it">Got it</span>}
          </div>
        )}
      </div>
      {cameraActive && (
        <p className="scanner__hint" role="status">
          {read ? "Got it — checking this product." : "Line up the barcode inside the box."}
        </p>
      )}
      {cameraActive ? (
        // One row, so the offer doesn't push Stop camera under the tab bar in a landscape phone.
        <p className="scanner__actions">
          {offerShown && !read && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onOfferLabelPhoto?.();
              }}
            >
              {NO_READ_OFFER}
            </button>
          )}
          <button type="button" onClick={stopCamera}>
            Stop camera
          </button>
        </p>
      ) : (
        primerOpen ? (
          <div className="camera-primer" role="group" aria-labelledby="camera-primer-heading">
            <h2 id="camera-primer-heading">{CAMERA_PRIMER_HEADING}</h2>
            <p>{CAMERA_PRIMER_LINE}</p>
            <p className="camera-primer__actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  markCameraPrimerSeen();
                  setPrimerOpen(false);
                  void startCamera();
                }}
              >
                Continue
              </button>
              <button type="button" className="button-secondary" onClick={() => setPrimerOpen(false)}>
                Not now
              </button>
            </p>
          </div>
        ) : (
          <p>
            <button type="button" className="button-primary" onClick={() => (cameraPrimerSeen() ? void startCamera() : setPrimerOpen(true))}>
              Scan with camera
            </button>
          </p>
        )
      )}
      {cameraError && <p role="alert">{cameraError}</p>}
    </section>
  );
}
