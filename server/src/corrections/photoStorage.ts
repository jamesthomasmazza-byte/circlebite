import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../env.js";

// A phone photo of a label is typically 2-6MB as a JPEG; this gives headroom without being
// unbounded. This is the first endpoint in the app that accepts a file from a user, and a required
// photo field is the first place someone can fill the disk — enforced here, not left implicit in
// whatever multer's own default happens to be.
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export type SniffedImageType = { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

/**
 * Real content-type validation by file signature (magic bytes), not the client-supplied
 * Content-Type header or the filename's extension — both are trivially spoofed (a multipart
 * request can declare any Content-Type it wants for a field; a filename is just a string an
 * attacker controls). This is the only check that says what the file actually is.
 */
export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}

/**
 * Writes an already-validated photo buffer to UPLOAD_DIR/corrections/<random-uuid>.<extension>.
 * The filename is entirely server-generated from a sniffed extension, never derived from anything
 * the client sent — no path-traversal surface from a crafted filename, because there's no user
 * input in the path at all. Returns a path relative to UPLOAD_DIR (not absolute) so a future
 * UPLOAD_DIR change on redeploy doesn't orphan paths already stored on old correction rows.
 */
export async function savePhotoBuffer(buffer: Buffer, extension: string): Promise<string> {
  const dir = path.join(env.uploadDir, "corrections");
  await mkdir(dir, { recursive: true });
  const relativePath = path.join("corrections", `${randomUUID()}.${extension}`);
  await writeFile(path.join(env.uploadDir, relativePath), buffer);
  return relativePath;
}

/** Resolves a stored relative photo path back to an absolute filesystem path for reading. */
export function resolvePhotoPath(relativePath: string): string {
  return path.join(env.uploadDir, relativePath);
}
