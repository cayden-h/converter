import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

/** A 1-second video WITH an audio track, generated with ffmpeg itself. */
export function ensureVideoFixture(ffmpegPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.mp4");
  if (!existsSync(target)) {
    execFileSync(ffmpegPath, [
      "-y",
      "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-pix_fmt", "yuv420p", "-shortest", target,
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

/** A minimal markdown document. Plain text - no tool needed to produce it. */
export function ensureMarkdownFixture(): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.md");
  if (!existsSync(target)) {
    writeFileSync(target, "# Sample\n\nSome **bold** text.\n");
  }
  return target;
}

/** A minimal standalone HTML document. Plain text - no tool needed. */
export function ensureHtmlFixture(): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.html");
  if (!existsSync(target)) {
    writeFileSync(
      target,
      "<!doctype html><html><head><title>Sample</title></head><body><h1>Sample</h1></body></html>\n",
    );
  }
  return target;
}

/**
 * A tiny real SVG with a visible shape, not just an empty wrapper - resvg
 * needs actual geometry to rasterize into a non-trivial PNG.
 */
export function ensureSvgFixture(): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.svg");
  if (!existsSync(target)) {
    writeFileSync(
      target,
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
        '<rect width="64" height="64" fill="red"/></svg>\n',
    );
  }
  return target;
}

/** A minimal CSV with a header row. Plain text - no tool needed. */
export function ensureCsvFixture(): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.csv");
  if (!existsSync(target)) {
    writeFileSync(target, "name,age\nAda,30\nGrace,40\n");
  }
  return target;
}
