import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchFeatures } from "../lib/api";
import { REGISTRATION_CLOSED } from "../lib/registrationCopy";
import { GuidedRegister } from "./GuidedRegister";
import { Register } from "./Register";

type Choice = "closed" | "guided" | "classic";

/**
 * /register (2026-10-27): today's Register page, unchanged, unless GUIDED_SETUP is on — read from the
 * public GET /api/features, since a signed-out browser can't read GET /me. Nothing shows while it
 * loads, so the classic form never flashes first.
 *
 * Since 2026-11-06, REGISTRATION off shows only that sign-up is closed, and a way to log in. If the
 * switches can't be read, it's the closed line too: the server refuses sign-up while it's off, so a
 * form shown on a guess could only fail.
 */
export function RegisterEntry() {
  const [choice, setChoice] = useState<Choice | null>(null);
  useEffect(() => {
    let live = true;
    fetchFeatures()
      .then((f) => live && setChoice(f.registrationOpen !== true ? "closed" : f.guidedSetupEnabled === true ? "guided" : "classic"))
      .catch(() => live && setChoice("closed"));
    return () => {
      live = false;
    };
  }, []);
  if (choice === null) return null;
  if (choice === "closed") return <RegistrationClosed />;
  return choice === "guided" ? <GuidedRegister /> : <Register />;
}

/** Sign-in still works for existing accounts, and an invite's returnTo is kept for it. */
export function RegistrationClosed() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  return (
    <main>
      <h1>Create your account</h1>
      <p>{REGISTRATION_CLOSED}</p>
      <p>
        Already have an account?{" "}
        <Link to={`/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>Log in</Link>
      </p>
    </main>
  );
}
