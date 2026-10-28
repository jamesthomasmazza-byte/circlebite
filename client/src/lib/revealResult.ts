// Brings a new scan result into view and moves focus to its heading (2026-10-28 audit). At 390×844
// the verdict card started below the fold, under the fixed tab bar, and after "Check this product"
// or a label photo focus fell to <body> when the submit button disabled — so a screen reader heard
// nothing at all. Focusing the card's h2 makes it read the verdict word.

type Revealable = Pick<HTMLElement, "scrollIntoView" | "focus" | "closest">;

/** The card's own container when there is one, so the scroll lands on the card's top edge rather
 *  than its heading; otherwise the heading itself. */
const REVEAL_TARGET = "[data-reveal-target]";

/** "auto" when the person has asked for reduced motion, "smooth" otherwise. */
export function revealBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

/** Scroll first, then focus without scrolling, so the focus call can't jump ahead of the scroll.
 *  The header isn't sticky (TabShell.tsx), so nothing needs subtracting for it; scroll-margin-top in
 *  styles.css keeps the card off the very top edge. */
export function revealResult(heading: Revealable, reducedMotion: boolean): void {
  const target = (heading.closest(REVEAL_TARGET) as Revealable | null) ?? heading;
  target.scrollIntoView({ block: "start", behavior: revealBehavior(reducedMotion) });
  heading.focus({ preventScroll: true });
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
