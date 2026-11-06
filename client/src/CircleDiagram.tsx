import type { CSSProperties } from "react";

import { initials } from "./lib/circleRedesign";

export type Bubble = { key: string; name: string; kind: "you" | "member" | "pending" };

// The ring holds this many bubbles; past it, the last one says how many more.
export const RING_MAX = 12;

/**
 * The circle as a picture (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN): the profile in the
 * middle, everyone on a dashed ring — "You" filled, others outlined, a waiting invite as a dashed
 * "?". Initials only, never photos (principle 5, N23). Decoration: hidden from screen readers,
 * because the list under it carries every fact the picture shows.
 */
export function CircleDiagram({ centerName, bubbles }: { centerName: string; bubbles: Bubble[] }) {
  const shown: Bubble[] =
    bubbles.length > RING_MAX
      ? [...bubbles.slice(0, RING_MAX - 1), { key: "more", name: `+${bubbles.length - (RING_MAX - 1)}`, kind: "member" }]
      : bubbles;
  return (
    <div className="circle-panel">
      <div className="circle-diagram" aria-hidden="true">
        <div className="circle-diagram__ring" />
        <div className="circle-diagram__center">
          <span className="circle-diagram__initial">{initials(centerName)}</span>
          <span className="circle-diagram__name">{centerName}</span>
        </div>
        {shown.map((b, i) => (
          <span
            key={b.key}
            className={`circle-diagram__bubble circle-diagram__bubble--${b.kind}`}
            style={{ "--angle": `${-90 + (360 * i) / shown.length}deg` } as CSSProperties}
          >
            {b.kind === "pending" ? "?" : b.kind === "you" ? "You" : b.key === "more" ? b.name : initials(b.name)}
          </span>
        ))}
      </div>
    </div>
  );
}
