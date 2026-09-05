import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generates a small PNG with ImageMagick itself. Generating rather than
 * committing a binary fixture keeps the repo clean and proves the tool works.
 */
export function ensurePngFixture(magickPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.png");
  if (!existsSync(target)) {
    execFileSync(magickPath, ["-size", "64x64", "xc:red", target]);
  }
  return target;
}

/** A 1-second silent video, generated with ffmpeg itself. */
export function ensureVideoFixture(ffmpegPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.mp4");
  if (!existsSync(target)) {
    execFileSync(ffmpegPath, [
      "-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10",
      "-pix_fmt", "yuv420p", target,
    ]);
  }
  return target;
}

/** A one-page PDF, generated with ImageMagick. */
export function ensurePdfFixture(magickPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.pdf");
  if (!existsSync(target)) {
    execFileSync(magickPath, ["-size", "120x80", "xc:white", target]);
  }
  return target;
}

/** A small HEIC image. HEIC to JPG is the spec's headline conversion. */
export function ensureHeicFixture(magickPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.heic");
  if (!existsSync(target)) {
    execFileSync(magickPath, ["-size", "64x64", "xc:navy", target]);
  }
  return target;
}
