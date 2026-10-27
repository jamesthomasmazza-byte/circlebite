import { useEffect, useState } from "react";

import { fetchFeatures } from "../lib/api";
import { GuidedRegister } from "./GuidedRegister";
import { Register } from "./Register";

/**
 * /register (2026-10-27): today's Register page, unchanged, unless GUIDED_SETUP is on — read from the
 * public GET /api/features, since a signed-out browser can't read GET /me. Nothing shows while it
 * loads, so the classic form never flashes first; if it can't be read, it's the classic form.
 */
export function RegisterEntry() {
  const [guided, setGuided] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetchFeatures()
      .then((f) => live && setGuided(f.guidedSetupEnabled === true))
      .catch(() => live && setGuided(false));
    return () => {
      live = false;
    };
  }, []);
  if (guided === null) return null;
  return guided ? <GuidedRegister /> : <Register />;
}
