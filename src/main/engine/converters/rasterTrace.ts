import { execFile as execFileOriginal } from "node:child_process";
import { unlink } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExecFileFn } from "../types";

/**
 * Raster to vector, in two steps.
 *
 * The spec requires png and jpg to svg, but potrace reads only pnm/pbm/pgm/bmp
 * - verified against the real binary - and vtracer, which reads raster
 * directly, is a Rust crate not installable via Homebrew.
 *
 * So this converter rasterises with ImageMagick and traces with potrace. It is
 * deliberately NOT a general chaining engine; it is one converter that happens
 * to invoke two tools, and it owns its intermediate file's cleanup.
 */
export const properties = {
  from: {
    images: ["png", "jpeg", "jpg", "gif", "bmp", "tiff", "webp"],
  },
  to: {
    images: ["svg"],
  },
};

export function convert(
  filePath: string,
  _fileType: string,
  _convertTo: string,
  targetPath: string,
  _options?: unknown,
  execFile: ExecFileFn = execFileOriginal as ExecFileFn,
  removeFile: (p: string) => void = (p) => unlink(p, () => {}),
): Promise<string> {
  const intermediate = path.join(
    tmpdir(),
    `converter-trace-${Date.now()}-${path.basename(targetPath, ".svg")}.pbm`,
  );

  return new Promise((resolve, reject) => {
    // potrace wants a bitmap. -monochrome gives it clean black and white
    // rather than a dithered greyscale that traces into noise.
    execFile("magick", [filePath, "-monochrome", intermediate], (rasterError) => {
      if (rasterError) {
        removeFile(intermediate);
        reject(new Error(`rasterise step failed: ${rasterError.message}`));
        return;
      }

      execFile("potrace", ["-s", "-o", targetPath, intermediate], (traceError) => {
        removeFile(intermediate);
        if (traceError) {
          reject(new Error(`trace step failed: ${traceError.message}`));
          return;
        }
        resolve("Done");
      });
    });
  });
}
