import { useState } from "react";

import {
  browserStorage,
  readSoundPref,
  SOUNDS_SETTING,
  SOUNDS_SETTING_LINE,
  SOUNDS_SETTING_UNSAVED,
  writeSoundPref,
} from "./lib/scanSounds";

/**
 * Scan sounds, on or off for this device (2026-11-05, Profile → Account, shown only with SCAN_SOUNDS
 * on). On by default; a browser that can't keep the choice counts as off and says so. The line under
 * it is JT's wording: silence is never a clean bill.
 */
export function ScanSoundsSetting({ storage = browserStorage() }: { storage?: Storage | null }) {
  const [on, setOn] = useState(() => readSoundPref(storage));
  const [unsaved, setUnsaved] = useState(storage === null);

  function change(next: boolean) {
    const kept = writeSoundPref(storage, next);
    setUnsaved(!kept);
    setOn(kept ? next : false);
  }

  return (
    <div className="scan-sounds-setting">
      <label>
        <input type="checkbox" checked={on} disabled={storage === null} onChange={(e) => change(e.target.checked)} />
        {SOUNDS_SETTING}
      </label>
      <p className="allergen-picker__hint">{SOUNDS_SETTING_LINE}</p>
      {unsaved && <p role="status">{SOUNDS_SETTING_UNSAVED}</p>}
    </div>
  );
}
