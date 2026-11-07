import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../lib/AuthContext";
import { JUDGE_LINK_NOT_FOUND, JUDGE_LINK_PATH, judgeLinkLanding, judgeLinkToken } from "../lib/judgeLink";

/**
 * /judge#<token> (2026-11-07): the one link for every judge. Reads the token from the fragment, takes
 * it out of the address bar before anything else, POSTs it, and goes to Maya's card. Any failure —
 * switched off, expired, wrong token, no world left — is the server's plain 404, shown as a plain
 * "Page not found", the same for every cause. Never indexed: the server sends X-Robots-Tag on this
 * path, and the page adds the meta tag too.
 */
export function JudgeLink() {
  const { signInWithJudgeLink } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = judgeLinkToken(window.location.hash);
    // Out of the address bar, and so out of history and any screenshot, before the request.
    window.history.replaceState(null, "", JUDGE_LINK_PATH);
    if (!token) {
      setFailed(true);
      return;
    }
    signInWithJudgeLink(token)
      .then((profileId) => navigate(judgeLinkLanding(profileId), { replace: true }))
      .catch(() => setFailed(true));
  }, [navigate, signInWithJudgeLink]);

  if (!failed) return <main aria-busy="true" />;
  return (
    <main>
      <h1>{JUDGE_LINK_NOT_FOUND}</h1>
    </main>
  );
}
