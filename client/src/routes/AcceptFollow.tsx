import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { acceptFollowInvite, ApiRequestError, getFollowInvite } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export function AcceptFollow() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<{ profileLabel: string; shareLevel: string; status: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    getFollowInvite(token)
      .then(setInvite)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setAcceptError(null);
    setAccepting(true);
    try {
      const { allergenProfileId } = await acceptFollowInvite(token);
      navigate(`/profiles/${allergenProfileId}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.message === "already_have_access") {
        setAcceptError("You already have access to this profile.");
      } else if (err instanceof ApiRequestError && err.message === "cannot_accept_own_invite") {
        setAcceptError("This is your own invite link — you already manage this profile.");
      } else {
        setAcceptError("This invite link has already been used or is no longer valid.");
      }
    } finally {
      setAccepting(false);
    }
  }

  if (loading || authLoading) return <p>Loading…</p>;

  if (loadError || !invite) {
    return (
      <main>
        <p>This invite link isn't valid.</p>
        <Link to="/dashboard">Go to your dashboard</Link>
      </main>
    );
  }

  if (invite.status !== "pending") {
    return (
      <main>
        <p>This invite link has already been used.</p>
        <Link to="/dashboard">Go to your dashboard</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>You've been invited to {invite.profileLabel}'s circle</h1>
      <p>
        You'll be able to see {invite.shareLevel === "severe_only" ? "the severe allergens on" : "the full"}{" "}
        profile and scan on their behalf. You won't be able to edit it.
      </p>
      {acceptError && <p role="alert">{acceptError}</p>}
      {user ? (
        <button type="button" onClick={handleAccept} disabled={accepting}>
          Accept
        </button>
      ) : (
        <p>
          <Link to={`/login?returnTo=${encodeURIComponent(`/follow/${token}`)}`}>Log in</Link> or{" "}
          <Link to={`/register?returnTo=${encodeURIComponent(`/follow/${token}`)}`}>create an account</Link> to
          accept this invite.
        </p>
      )}
    </main>
  );
}
