import { useState } from "react";

import { COPIED, COPY_FAILED, COPY_LINK, LINK_SHOWN_ONCE } from "./lib/inviteCopy";

/** A link shown once, with a Copy link button (2026-10-26). The field stays selectable, so a browser
 *  without clipboard access can still copy it by hand. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="copy-link">
      <label>
        {LINK_SHOWN_ONCE}
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
      </label>
      <button type="button" onClick={() => void copy()}>
        {COPY_LINK}
      </button>
      <span role="status">{copied === "yes" ? COPIED : copied === "failed" ? COPY_FAILED : ""}</span>
    </div>
  );
}
