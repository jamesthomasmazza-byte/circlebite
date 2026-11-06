import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

import { BoxRegionReader } from "./boxRegionReader";
import { CAMERA_PRIMER_HEADING, CAMERA_PRIMER_LINE, cameraPrimerSeen, markCameraPrimerSeen } from "./lib/cameraPrimer";
import { prefersReducedMotion, revealBehavior } from "./lib/revealResult";
import { NO_READ_OFFER, NO_READ_OFFER_MS } from "./lib/scannerCopy";
import { FLASH_OFF, FLASH_ON, POINT_AT_BARCODE, SCANS_ON_ITS_OWN } from "./lib/scanRedesign";
import { countDecodes, msSince, type ClientTiming, type DecodeCount } from "./lib/scanTiming";

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
 *
 * `start()`, through a ref, is Scan's pinned "Scan another product" (2026-10-29): the same tap as
 * "Scan with camera", from wherever the person is on a result. It scrolls the scanner into view,
 * then takes the same path as the button (requestCamera) — the camera sentence on a device that
 * hasn't seen it, else the camera — synchronously, inside the tap. Nothing calls it but a click:
 * the camera never opens by itself. onBusyChange tells Scan when the camera or the sentence is up,
 * so the pinned button gets out of the way.
 *
 * With `stage` (SCAN_REDESIGN, 2026-11-06) the same scanner is laid out as the screen: the preview
 * fills a dark stage, the box is a frame of four corner brackets with a scan line, and while it runs
 * the hint says it reads on its own — true, since zxing decodes every frame with no tap. Before that
 * it still waits for a tap, with the first-use sentence first: the camera never opens by itself. A
 * flash button shows only when the camera track says it has a torch (zxing's switchTorch). The box
 * is still the element the region reader decodes inside.
 */
export type BarcodeScannerHandle = { start: () => void };

export const BarcodeScanner = forwardRef<
  BarcodeScannerHandle,
  {
    /** With the phone's camera timings for this read (lib/scanTiming.ts). */
    onDetected: (text: string, timing: ClientTiming) => void;
    onOfferLabelPhoto?: () => void;
    region?: boolean;
    onBusyChange?: (busy: boolean) => void;
    /** The moment of the read, with the vibration, before "Got it" hands over (Scan's beep). */
    onRead?: () => void;
    /** The redesigned Scan tab's layout (SCAN_REDESIGN). Off, today's markup exactly. */
    stage?: boolean;
  }
>(function BarcodeScanner({ onDetected, onOfferLabelPhoto, region = false, onBusyChange, onRead, stage = false }, ref) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [offerShown, setOfferShown] = useState(false);
  // The camera track's torch, where it has one (stage only). Gone with the camera.
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // The one sentence before this device's first camera use (lib/cameraPrimer.ts), ahead of
  // startCamera and the system prompt — nothing in the camera code changes.
  const [primerOpen, setPrimerOpen] = useState(false);
  // Set by start(): the sentence was opened from the pinned button, far from the finger, so focus
  // follows it there. The scanner's own button sits right beside the sentence and needs no move.
  const focusPrimerRef = useRef(false);
  const primerHeadingRef = useRef<HTMLHeadingElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // zxing calls back once per decoded frame; only the first read counts.
  const readRef = useRef(false);
  // The latest callback, not the one from when the camera started — the profile picked can change.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  // Step 0's timings (lib/scanTiming.ts): from the tap to the camera's first frame — so a first use
  // includes the time on the browser's permission prompt — and from then to the read.
  // Then, ahead of B, what the decoder did in that time: its tries, the ms each took, the picture
  // it was given and whether it read only the box.
  const requestedAtRef = useRef(0);
  const runningAtRef = useRef<number | null>(null);
  const decodesRef = useRef<DecodeCount>({ attempts: 0, ms: 0 });
  function cameraTiming(): ClientTiming {
    const running = runningAtRef.current;
    if (running === null) return {};
    const { attempts, ms } = decodesRef.current;
    const video = videoRef.current;
    return {
      cam: Math.round(running - requestedAtRef.current),
      decode: msSince(running),
      ...(attempts > 0 && { attempts, each: Math.round(ms / attempts) }),
      ...(video && video.videoWidth > 0 && { w: video.videoWidth, h: video.videoHeight }),
      region: region ? 1 : 0,
    };
  }


  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
    setRead(false);
    setTorchAvailable(false);
    setTorchOn(false);
  }

  async function startCamera() {
    requestedAtRef.current = performance.now();
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
      decodesRef.current = countDecodes(reader);
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (detected) => {
        if (!detected || readRef.current) return;
        readRef.current = true;
        const text = detected.getText();
        const timing = cameraTiming();
        setRead(true);
        navigator.vibrate?.(50);
        onReadRef.current?.();
        window.setTimeout(() => {
          stopCamera();
          onDetectedRef.current(text, timing);
        }, READ_CONFIRM_MS);
      });
      controlsRef.current = controls;
      setTorchAvailable(stage && typeof controls.switchTorch === "function");
    } catch {
      // No camera device, permission denied, or an insecure context — manual entry stays
      // available either way, so this is a soft failure, not a page-level error.
      setCameraError("Couldn't access the camera. You can still enter the barcode by hand below.");
      setCameraActive(false);
    }
  }

  /** The one way to the camera, from "Scan with camera" and from start(): the camera sentence
   *  before this device's first use (lib/cameraPrimer.ts), else the camera itself. Synchronous up
   *  to the camera request, so a phone that wants a tap for the camera gets this one. */
  function requestCamera() {
    if (cameraPrimerSeen()) void startCamera();
    else setPrimerOpen(true);
  }

  /** The first-use sentence's Continue, in either layout: the one tap that reaches the camera from it. */
  function continuePrimer() {
    markCameraPrimerSeen();
    setPrimerOpen(false);
    void startCamera();
  }

  /** The label-photo offer's button, in either layout: stop the camera, then open the photo flow. */
  function takeOffer() {
    stopCamera();
    onOfferLabelPhoto?.();
  }

  useImperativeHandle(ref, () => ({
    start() {
      if (cameraActive) return;
      containerRef.current?.scrollIntoView({ block: "start", behavior: revealBehavior(prefersReducedMotion()) });
      focusPrimerRef.current = true;
      requestCamera();
    },
  }));

  useEffect(() => {
    if (primerOpen && focusPrimerRef.current) primerHeadingRef.current?.focus({ preventScroll: true });
    focusPrimerRef.current = false;
  }, [primerOpen]);

  const busy = cameraActive || primerOpen;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

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

  // The camera's first frame, for cameraTiming — apart from the camera code, like the scroll above.
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraActive || !video) return;
    runningAtRef.current = null;
    const playing = () => {
      if (runningAtRef.current === null) runningAtRef.current = performance.now();
    };
    video.addEventListener("playing", playing);
    return () => video.removeEventListener("playing", playing);
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

  async function toggleTorch() {
    const next = !torchOn;
    try {
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      // A torch the track claimed but couldn't switch: drop the button rather than lie about it.
      setTorchAvailable(false);
    }
  }

  if (stage) {
    return (
      <section ref={containerRef} className="scanner-section scanner-section--stage">
        <div className="scanner scanner--stage" data-active={cameraActive} data-read={read}>
          <video ref={videoRef} className="scanner__video" muted playsInline />
          <div ref={boxRef} className="scanner__box scanner__frame" aria-hidden="true">
            {cameraActive && !read && <span className="scanner__line" />}
            {read && <span className="scanner__got-it">Got it</span>}
          </div>
          {cameraActive && torchAvailable && (
            <button type="button" className="scanner__torch" aria-pressed={torchOn} onClick={() => void toggleTorch()}>
              {torchOn ? FLASH_OFF : FLASH_ON}
            </button>
          )}
          {!cameraActive && !primerOpen && (
            <p className="scanner__start">
              <button type="button" className="button-primary" onClick={requestCamera}>
                Scan with camera
              </button>
            </p>
          )}
        </div>
        {cameraActive && (
          <p className="scanner__hint" role="status">
            {read ? (
              "Got it — checking this product."
            ) : (
              <>
                <strong>{POINT_AT_BARCODE}</strong>
                <br />
                {SCANS_ON_ITS_OWN}
              </>
            )}
          </p>
        )}
        {cameraActive && (
          <p className="scanner__actions">
            {offerShown && !read && (
              <button
                type="button"
                onClick={takeOffer}
              >
                {NO_READ_OFFER}
              </button>
            )}
            <button type="button" onClick={stopCamera}>
              Stop camera
            </button>
          </p>
        )}
        {!cameraActive && primerOpen && (
          <div className="camera-primer" role="group" aria-labelledby="camera-primer-heading">
            <h2 id="camera-primer-heading" ref={primerHeadingRef} tabIndex={-1}>
              {CAMERA_PRIMER_HEADING}
            </h2>
            <p>{CAMERA_PRIMER_LINE}</p>
            <p className="camera-primer__actions">
              <button
                type="button"
                className="button-primary"
                onClick={continuePrimer}
              >
                Continue
              </button>
              <button type="button" className="button-secondary" onClick={() => setPrimerOpen(false)}>
                Not now
              </button>
            </p>
          </div>
        )}
        {cameraError && <p role="alert">{cameraError}</p>}
      </section>
    );
  }

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
              onClick={takeOffer}
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
            <h2 id="camera-primer-heading" ref={primerHeadingRef} tabIndex={-1}>
              {CAMERA_PRIMER_HEADING}
            </h2>
            <p>{CAMERA_PRIMER_LINE}</p>
            <p className="camera-primer__actions">
              <button
                type="button"
                className="button-primary"
                onClick={continuePrimer}
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
            <button type="button" className="button-primary" onClick={requestCamera}>
              Scan with camera
            </button>
          </p>
        )
      )}
      {cameraError && <p role="alert">{cameraError}</p>}
    </section>
  );
});
