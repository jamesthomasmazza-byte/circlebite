import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { acceptCoManagerInvite, ApiRequestError, getCoManagerInvite } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export function AcceptCoManager() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<{ profileLabel: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    getCoManagerInvite(token)
      .then(setInvite)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setAcceptError(null);
    setAccepting(true);
    try {
      const { allergenProfileId } = await acceptCoManagerInvite(token);
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
      <h1>You've been invited to co-manage {invite.profileLabel}'s profile</h1>
      <p>You'll have full edit rights: allergens, severities, and inviting others into the circle.</p>
      {acceptError && <p role="alert">{acceptError}</p>}
      {user ? (
        <button type="button" onClick={handleAccept} disabled={accepting}>
          Accept
        </button>
      ) : (
        <p>
          <Link to={`/login?returnTo=${encodeURIComponent(`/co-manager/${token}`)}`}>Log in</Link> or{" "}
          <Link to={`/register?returnTo=${encodeURIComponent(`/co-manager/${token}`)}`}>create an account</Link>{" "}
          to accept this invite.
        </p>
      )}
    </main>
  );
}
