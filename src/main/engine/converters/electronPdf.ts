import { execFile as execFileOriginal } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExecFileFn } from "../types";

/**
 * Markdown and HTML to PDF, using Electron's own Chromium.
 *
 * pandoc has no PDF engine; it delegates to LaTeX, which is a multi-gigabyte
 * dependency this app will not ship. Electron already contains a browser that
 * renders PDFs well, so it is the engine.
 *
 * The renderer is injected so this module is testable without launching a
 * BrowserWindow - the real one lives in src/main/pdf.ts.
 */
export type PdfRenderer = (htmlPath: string) => Promise<Buffer>;
export type FileWriter = (targetPath: string, data: Buffer) => Promise<void>;

export const properties = {
  from: {
    documents: ["markdown", "md", "html", "htm"],
  },
  to: {
    documents: ["pdf"],
  },
};

export async function convert(
  filePath: string,
  fileType: string,
  _convertTo: string,
  targetPath: string,
  _options?: unknown,
  execFile: ExecFileFn = execFileOriginal as ExecFileFn,
  render?: PdfRenderer,
  write: FileWriter = (target, data) => writeFile(target, data),
): Promise<string> {
  if (!render) throw new Error("electronPdf: no renderer supplied");

  let htmlPath = filePath;

  if (fileType === "markdown" || fileType === "md") {
    htmlPath = path.join(tmpdir(), `converter-md-${Date.now()}.html`);
    await new Promise<void>((resolve, reject) => {
      execFile("pandoc", ["-s", "-o", htmlPath, filePath], (error) => {
        if (error) reject(new Error(`markdown to html failed: ${error.message}`));
        else resolve();
      });
    });
  }

  // Let a render failure propagate before anything is written: a partial PDF
  // on disk would be reported as a success by the job runner's existence check.
  const pdf = await render(htmlPath);
  await write(targetPath, pdf);
  return "Done";
}
