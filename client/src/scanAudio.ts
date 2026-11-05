import { TONES, type ScanSound } from "./lib/scanSounds";

// Plays lib/scanSounds.ts's tones with Web Audio (2026-11-05). Not an <audio> element: on an iPhone,
// Web Audio follows the Ring/Silent switch, so silent mode means no sound, which is what a quiet
// aisle wants. Where Safari has navigator.audioSession, it's set to "ambient" to say so, and so a
// beep mixes with any music playing instead of stopping it.
//
// A browser lets a page make sound only after a tap, so Scan calls unlockScanAudio() from the
// person's own taps and keys. If it never unlocked, or anything here throws, nothing plays and
// nothing breaks: the card is the signal, and a sound only ever adds to it.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

export function unlockScanAudio(): void {
  try {
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session) session.type = "ambient";
    if (!context) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return;
      context = new Ctor();
    }
    if (context.state !== "running") void context.resume();
  } catch {
    context = null;
  }
}

export function playScanSound(sound: ScanSound): void {
  try {
    if (!context || context.state !== "running" || document.hidden) return;
    const tone = TONES[sound];
    let at = context.currentTime + 0.01;
    for (let i = 0; i < tone.pulses; i++) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = tone.wave;
      osc.frequency.value = tone.frequency;
      // A 5 ms ramp in and out, so a pulse doesn't click.
      const end = at + tone.pulseMs / 1000;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(tone.gain, at + 0.005);
      gain.gain.setValueAtTime(tone.gain, end - 0.005);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(end + 0.01);
      at = end + tone.gapMs / 1000;
    }
  } catch {
    // Nothing plays; the card is unchanged.
  }
}
