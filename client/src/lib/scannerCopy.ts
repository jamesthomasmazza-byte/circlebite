// The camera scanner's offer of a label photo when no barcode reads (2026-10-26, BACKLOG "Plan to
// judging" item 1). An offer, never an automatic switch: a crushed or curved barcode often reads on
// the third try, so the camera keeps running until the person taps it. Plain values, under test.

/** How long the camera runs without a read before the offer shows. */
export const NO_READ_OFFER_MS = 8000;

export const NO_READ_OFFER = "Can't read the barcode? Photograph the ingredients label";
