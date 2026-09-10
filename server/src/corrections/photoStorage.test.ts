import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";

import { env } from "../env.js";
import { MAX_PHOTO_BYTES, resolvePhotoPath, savePhotoBuffer, sniffImageType } from "./photoStorage.js";

// Real magic bytes for each format, not invented — the whole point of sniffImageType is that it
// checks actual file signatures, so the tests have to use real ones.
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP_MAGIC = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from("WEBP")]);

test("sniffImageType recognizes real JPEG magic bytes", () => {
  assert.deepEqual(sniffImageType(JPEG_MAGIC), { mimeType: "image/jpeg", extension: "jpg" });
});

test("sniffImageType recognizes real PNG magic bytes", () => {
  assert.deepEqual(sniffImageType(PNG_MAGIC), { mimeType: "image/png", extension: "png" });
});

test("sniffImageType recognizes real WebP magic bytes (RIFF....WEBP)", () => {
  assert.deepEqual(sniffImageType(WEBP_MAGIC), { mimeType: "image/webp", extension: "webp" });
});

test("sniffImageType rejects a file whose name claims .jpg but whose bytes aren't an image — the actual point of this function", () => {
  // A PDF's real magic bytes ("%PDF"), the kind of thing a spoofed filename/Content-Type would
  // otherwise sail through as "image/jpeg" if we trusted either of those instead of the content.
  const fakeJpeg = Buffer.from("%PDF-1.4 this is not a photo");
  assert.equal(sniffImageType(fakeJpeg), null);
});

test("sniffImageType rejects garbage and empty buffers", () => {
  assert.equal(sniffImageType(Buffer.from("not an image at all")), null);
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
});

test("MAX_PHOTO_BYTES is a real, finite cap — a required photo field is the first place someone can fill the disk", () => {
  assert.ok(Number.isFinite(MAX_PHOTO_BYTES));
  assert.ok(MAX_PHOTO_BYTES > 0);
});

test("savePhotoBuffer writes real bytes under UPLOAD_DIR/corrections, and resolvePhotoPath finds them", async () => {
  const relativePath = await savePhotoBuffer(JPEG_MAGIC, "jpg");
  try {
    assert.ok(relativePath.startsWith("corrections" + path.sep));
    assert.ok(relativePath.endsWith(".jpg"));

    const absolutePath = resolvePhotoPath(relativePath);
    assert.ok(absolutePath.startsWith(env.uploadDir));

    const stats = await stat(absolutePath);
    assert.ok(stats.isFile());

    const written = await readFile(absolutePath);
    assert.deepEqual(written, JPEG_MAGIC);
  } finally {
    await rm(resolvePhotoPath(relativePath), { force: true });
  }
});

test("savePhotoBuffer never collides — two saves of the same bytes get different filenames", async () => {
  const a = await savePhotoBuffer(PNG_MAGIC, "png");
  const b = await savePhotoBuffer(PNG_MAGIC, "png");
  try {
    assert.notEqual(a, b);
  } finally {
    await rm(resolvePhotoPath(a), { force: true });
    await rm(resolvePhotoPath(b), { force: true });
  }
});

after(async () => {
  // Belt and suspenders on top of each test's own cleanup — remove the whole corrections
  // subdirectory this file's test run created, so nothing lingers under the local uploads/ dir.
  await rm(path.join(env.uploadDir, "corrections"), { recursive: true, force: true });
});
