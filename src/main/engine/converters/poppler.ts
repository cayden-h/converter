import { execFile as execFileOriginal } from "node:child_process";
import path from "node:path";
import type { ExecFileFn } from "../types";

/**
 * Poppler reads PDFs, which nothing else in the bundle can do. Upstream
 * ConvertX has no poppler converter, so this module is ours rather than lifted.
 *
 * It follows the same shape as a lifted converter - a `properties` table plus a
 * `convert()` taking an execFileOverride - so the registry and job runner treat
 * it identically.
 */
export const properties = {
  from: {
    documents: ["pdf"],
  },
  to: {
    images: ["png", "jpeg", "tiff"],
    documents: ["txt"],
  },
};

const IMAGE_FLAGS: Record<string, string> = {
  png: "-png",
  jpeg: "-jpeg",
  jpg: "-jpeg",
  tiff: "-tiff",
};

export function convert(
  filePath: string,
  _fileType: string,
  convertTo: string,
  targetPath: string,
  _options?: unknown,
  execFile: ExecFileFn = execFileOriginal as ExecFileFn,
): Promise<string> {
  const target = convertTo.toLowerCase();

  return new Promise((resolve, reject) => {
    if (target === "txt") {
      execFile("pdftotext", [filePath, targetPath], (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`pdftotext failed: ${error.message}`));
          return;
        }
        if (stderr) console.error(`stderr: ${stderr}`);
        resolve("Done");
      });
      return;
    }

    const flag = IMAGE_FLAGS[target];
    if (!flag) {
      reject(new Error(`poppler: unsupported target format ${convertTo}`));
      return;
    }

    // pdftoppm treats its final argument as a PREFIX and appends its own
    // "-1.png" suffix, so handing it the full target path would produce
    // out.png-1.png. Strip the extension and let it complete the name.
    const prefix = path.join(
      path.dirname(targetPath),
      path.basename(targetPath, path.extname(targetPath)),
    );

    // Only the first page: a multi-page PDF would otherwise emit one file per
    // page and none of them at the path the job runner expects.
    execFile(
      "pdftoppm",
      [flag, "-f", "1", "-l", "1", "-singlefile", filePath, prefix],
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`pdftoppm failed: ${error.message}`));
          return;
        }
        if (stderr) console.error(`stderr: ${stderr}`);
        resolve("Done");
      },
    );
  });
}
