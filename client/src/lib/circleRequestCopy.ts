// The words of follow requests (server routes/circleRequests.ts, 2026-10-27, behind CIRCLE_REQUESTS).
// Plain values, under test. The requester is told what the owner will see and that they'll see
// nothing back; after sending, every case gets the same sentence, whatever the address was.

export const ASK_HEADING = "Ask to follow someone's profile";

export const ASK_EMAIL_LABEL = "The parent's email address";

/** What the form tells the requester before they send. The owner's card shows exactly this. */
export const ASK_NOTE =
  "They'll see your name and email address. You'll see nothing about their profiles unless they approve.";

/** The one answer to every request sent. Never says whether the address has an account. */
export const ASK_SENT =
  "Request sent. If that address has a CircleBite account, they'll see your request. Once they approve, the profile appears under your Profiles.";

export const REQUESTS_HEADING = "Follow requests";

export const APPROVE_NOTE = "Approve only someone you know. Check the email address.";

export const CHOOSE_BOTH = "Choose a profile and what they'll see.";

export const NOTHING_LEFT_TO_SHARE = "They already follow every profile you own.";

export const SHARE_CHOICES = [
  { value: "all", label: "Full profile" },
  { value: "severe_only", label: "Severe allergens only" },
] as const;

/** One request, on its card and in Scan's notice line. */
export function requestLine(r: { requester_name: string; requester_email: string }): string {
  return `${r.requester_name} (${r.requester_email}) asked to follow one of your profiles.`;
}

/** Scan's notice line: the request itself when there's one, a count when there are more — one line
 *  either way, so it never pushes Scan's form far down. */
export function requestNoticeLine(requests: { requester_name: string; requester_email: string }[]): string {
  return requests.length === 1 ? requestLine(requests[0]) : `${requests.length} people asked to follow your profiles.`;
}

/** The Circle tab badge, for a screen reader. */
export function requestBadgeLabel(count: number): string {
  return count === 1 ? "1 follow request" : `${count} follow requests`;
}
