import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException, type Result } from "@zxing/library";

import { boxToFrame, type Rect } from "./lib/scannerRegion";

function onScreen(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/**
 * The camera reader with SCANNER_REGION on (2026-10-27): decodes only what's inside the target box.
 *
 * zxing's own scan loop draws each frame onto a canvas and passes it here, then retries after a
 * "not found" — so this changes only that one step. It copies the box's part of the frame (plus
 * REGION_ALLOWANCE) onto a small canvas of its own and decodes that. Opening the camera, the loop,
 * its retries and stopping are all zxing's, exactly as with the plain reader.
 *
 * The box is measured on every attempt, so a rotation or a change to its CSS is followed. If it
 * can't be measured yet, that attempt is "not found" and the loop tries again: never the whole
 * frame instead.
 */
export class BoxRegionReader extends BrowserMultiFormatReader {
  private readonly crop = document.createElement("canvas");

  constructor(private readonly elements: () => { video: HTMLVideoElement; box: Element } | null) {
    super();
  }

  override decodeFromCanvas(canvas: HTMLCanvasElement): Result {
    const els = this.elements();
    const found =
      els && boxToFrame(onScreen(els.video), onScreen(els.box), { width: els.video.videoWidth, height: els.video.videoHeight });
    // zxing's canvas keeps the frame size the camera started with; after a rotation only its own
    // area holds a picture.
    const region = found && boxToFrame({ x: 0, y: 0, width: canvas.width, height: canvas.height }, found, canvas, 0);
    if (!region) throw new NotFoundException("The scanner box isn't measurable yet.");
    this.crop.width = region.width;
    this.crop.height = region.height;
    const ctx = this.crop.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new NotFoundException("No canvas for the scanner box.");
    ctx.drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    return super.decodeFromCanvas(this.crop);
  }
}
