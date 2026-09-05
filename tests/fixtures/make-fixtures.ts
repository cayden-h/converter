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
