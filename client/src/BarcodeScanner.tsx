import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

// How long "Got it" shows on the box before the camera stops and the scan runs.
const READ_CONFIRM_MS = 250;

/**
 * The camera scanner, moved out of Scan.tsx (2026-10-24) with a target box over the preview: an
 * outlined box with the view dimmed outside it, and "Line up the barcode inside the box" under it.
 *
 * The box is a GUIDE ONLY. decodeFromVideoDevice reads the whole frame and has no region option;
 * decoding only the box needs our own frame loop (decodeFromCanvas on a cropped canvas), which is in
 * BACKLOG for after judging. So a barcode outside the box can still read — the box shows where to
 * aim, it doesn't decide what counts.
 *
 * On a read, the box goes solid with "Got it" (and a short buzz where the phone supports it) for a
 * quarter second, then the camera stops and onDetected runs — the same order as before.
 */
export function BarcodeScanner({ onDetected }: { onDetected: (text: string) => void }) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
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
    // Bring the preview, hint and Stop camera into view above the tab bar — in a landscape phone
    // the bar takes a fifth of the height.
    containerRef.current?.scrollIntoView({ block: "start" });
    try {
      const reader = new BrowserMultiFormatReader();
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
          <div className="scanner__box" aria-hidden="true">
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
  );
}
