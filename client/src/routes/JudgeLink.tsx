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
    let sending = false;
    const attempt = () => {
      const token = judgeLinkToken(window.location.hash);
      // Out of the address bar and the tab's back history before the request. The browser's own
      // history still records the URL it opened; no page can remove that (docs/server-setup.md §16a).
      window.history.replaceState(null, "", JUDGE_LINK_PATH);
      if (!token) {
        setFailed(true);
        return;
      }
      if (sending) return;
      sending = true;
      setFailed(false);
      signInWithJudgeLink(token)
        .then((profileId) => navigate(judgeLinkLanding(profileId), { replace: true }))
        .catch(() => setFailed(true))
        .finally(() => {
          sending = false;
        });
    };
    // Once on arrival (the ref keeps StrictMode's second run from sending again), and again whenever
    // the link is opened in a tab already on /judge, which the browser treats as a hash change, not
    // a page load: found clicking through it on Nov 7, after a failed first try.
    if (!started.current) {
      started.current = true;
      attempt();
    }
    window.addEventListener("hashchange", attempt);
    return () => window.removeEventListener("hashchange", attempt);
  }, [navigate, signInWithJudgeLink]);

  if (!failed) return <main aria-busy="true" />;
  return (
    <main>
      <h1>{JUDGE_LINK_NOT_FOUND}</h1>
    </main>
  );
}
