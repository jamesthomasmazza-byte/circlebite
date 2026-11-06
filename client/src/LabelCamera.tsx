import { useEffect, useRef, useState } from "react";

import { CAMERA_PRIMER_HEADING, CAMERA_PRIMER_LINE, cameraPrimerSeen, markCameraPrimerSeen } from "./lib/cameraPrimer";
import { FLASH_OFF, FLASH_ON, TAKE_PHOTO } from "./lib/scanRedesign";

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type ImageCaptureLike = { takePhoto: () => Promise<Blob> };
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike } | undefined;

/**
 * The redesigned Scan tab's label photo camera (JT's mockup, 2026-11-06, behind SCAN_REDESIGN): a
 * live preview in a tall frame for the ingredients panel, and a shutter. What it hands back is a
 * photo File, which Scan sends exactly as a chosen one — the same downscale and upload
 * (handlePhotoSubmit, downscaleLabelPhoto). Like the barcode camera it never opens by itself: a tap,
 * with the first-use sentence first on a new device. The shutter takes the camera's full-resolution
 * photo where the browser can (ImageCapture), else the largest frame the preview has. A flash
 * button shows only when the camera track has a torch.
 */
export function LabelCamera({ onCapture, busy }: { onCapture: (photo: File) => void; busy: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
    setTorchAvailable(false);
    setTorchOn(false);
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      const track = stream.getVideoTracks()[0];
      setTorchAvailable(Boolean((track?.getCapabilities?.() as TorchCapabilities | undefined)?.torch));
    } catch {
      stop();
      setError("Couldn't open the camera. You can still choose a photo below.");
    }
  }

  function request() {
    if (cameraPrimerSeen()) void start();
    else setPrimerOpen(true);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    const next = !torchOn;
    try {
      await track?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  async function shoot() {
    const track = streamRef.current?.getVideoTracks()[0];
    const video = videoRef.current;
    if (!track || !video) return;
    let blob: Blob | null = null;
    if (typeof ImageCapture !== "undefined") {
      try {
        blob = await new ImageCapture(track).takePhoto();
      } catch {
        blob = null;
      }
    }
    if (!blob) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    }
    stop();
    if (!blob) {
      setError("Couldn't take that photo. Try again, or choose a photo below.");
      return;
    }
    onCapture(new File([blob], "label.jpg", { type: blob.type || "image/jpeg" }));
  }

  return (
    <div className="label-camera">
      <div className="label-camera__view" data-active={active}>
        <video ref={videoRef} className="label-camera__video" muted playsInline />
        <div className="label-camera__frame" aria-hidden="true" />
        {active && torchAvailable && (
          <button type="button" className="scanner__torch" aria-pressed={torchOn} onClick={() => void toggleTorch()}>
            {torchOn ? FLASH_OFF : FLASH_ON}
          </button>
        )}
        {!active && !primerOpen && (
          <p className="scanner__start">
            <button type="button" className="button-primary" onClick={request}>
              Open the camera
            </button>
          </p>
        )}
      </div>
      {primerOpen && (
        <div className="camera-primer" role="group" aria-labelledby="label-camera-primer-heading">
          <h2 id="label-camera-primer-heading">{CAMERA_PRIMER_HEADING}</h2>
          <p>{CAMERA_PRIMER_LINE}</p>
          <p className="camera-primer__actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                markCameraPrimerSeen();
                setPrimerOpen(false);
                void start();
              }}
            >
              Continue
            </button>
            <button type="button" className="button-secondary" onClick={() => setPrimerOpen(false)}>
              Not now
            </button>
          </p>
        </div>
      )}
      {active && (
        <p className="label-camera__controls">
          <button type="button" className="label-camera__shutter" disabled={busy} onClick={() => void shoot()}>
            {TAKE_PHOTO}
          </button>
          <button type="button" onClick={stop}>
            Stop camera
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
