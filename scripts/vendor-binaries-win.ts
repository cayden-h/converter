import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Vendors the Windows conversion tools into resources/bin/win32-x64 so the
 * packaged app converts files on a PC with nothing installed.
 *
 * This is a SIBLING of scripts/vendor-binaries.ts, not an extension of it.
 * That script exists almost entirely to solve a problem Windows does not
 * have: Homebrew binaries link their dependencies by absolute path, so it
 * walks an `otool -L` closure, rewrites every reference with
 * install_name_tool, and re-signs afterwards. Windows tools ship as
 * self-contained archives. Merging the two would produce a script that is
 * mostly dead code whichever platform it runs on.
 */

export type ArchiveKind = "zip" | "7z" | "raw";

export interface WindowsSource {
  /** Label used in log lines and error messages. */
  name: string;
  url: string;
  /** SHA-256 of the downloaded file. Refresh with `npm run digests:win`. */
  sha256: string;
  archive: ArchiveKind;
  /**
   * Archive member basename -> destination filename in bin/.
   *
   * Matched on basename because every one of these archives nests its
   * executables under a versioned top-level directory, which changes on each
   * upstream release. For a `raw` source there is exactly one entry and the
   * key is ignored.
   */
  members: Record<string, string>;
}

/**
 * Every pinned download. Versions live here and nowhere else.
 *
 * Three of these URLs are mutable in place - BtbN republishes the
 * `n9.0-latest` tag, and the poppler and potrace URLs are plain file
 * downloads with no release immutability - so each entry carries a digest
 * and a changed upstream fails the build instead of shipping silently.
 */
export const SOURCES: WindowsSource[] = [
  {
    name: "ffmpeg",
    // The GPL build, not LGPL. This project is already AGPL-3.0-or-later
    // because of the ConvertX code recorded in THIRD_PARTY.md, so GPL is
    // compatible and gives the wider codec set. Static: no DLLs to carry.
    url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-gpl-9.0.zip",
    sha256: "",
    archive: "zip",
    members: { "ffmpeg.exe": "ffmpeg.exe", "ffprobe.exe": "ffprobe.exe" },
  },
  {
    name: "imagemagick",
    // The portable build is statically linked, so unlike the Homebrew build
    // there are no dlopen'd coder modules to locate and relocate, and the
    // configuration XML ships inside this same archive. Distributed as .7z,
    // which is why main() needs 7-Zip.
    url: "https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-31/ImageMagick-7.1.2-31-portable-Q16-HDRI-x64.7z",
    sha256: "",
    archive: "7z",
    members: { "magick.exe": "magick.exe" },
  },
  {
    name: "pandoc",
    url: "https://github.com/jgm/pandoc/releases/download/3.11/pandoc-3.11-windows-x86_64.zip",
    sha256: "",
    archive: "zip",
    members: { "pandoc.exe": "pandoc.exe" },
  },
  {
    name: "poppler",
    url: "https://github.com/oschwartz10612/poppler-windows/releases/download/v26.07.0-0/Release-26.07.0-0.zip",
    sha256: "",
    archive: "zip",
    members: {
      "pdftoppm.exe": "pdftoppm.exe",
      "pdftotext.exe": "pdftotext.exe",
      "pdfimages.exe": "pdfimages.exe",
    },
  },
  {
    name: "resvg",
    // PINNED BACKWARDS DELIBERATELY. v0.48.0 and v0.48.1 publish macOS
    // assets only; v0.47.0 is the most recent release that still ships
    // resvg-win64.zip. Check the asset list before bumping this - a forward
    // bump that 404s is obvious, but one that resolves to a macOS-only
    // release loses SVG conversion quietly.
    url: "https://github.com/linebender/resvg/releases/download/v0.47.0/resvg-win64.zip",
    sha256: "",
    archive: "zip",
    members: { "resvg.exe": "resvg.exe" },
  },
  {
    name: "dasel",
    url: "https://github.com/TomWright/dasel/releases/download/v3.11.2/dasel_windows_amd64.exe",
    sha256: "",
    archive: "raw",
    members: { "dasel_windows_amd64.exe": "dasel.exe" },
  },
  {
    name: "potrace",
    url: "https://potrace.sourceforge.net/download/1.16/potrace-1.16.win64.zip",
    sha256: "",
    archive: "zip",
    members: { "potrace.exe": "potrace.exe" },
  },
];

/**
 * The destination filename for one archive member, or null if the member is
 * not wanted.
 *
 * Matches on basename: these archives nest under a versioned top-level
 * directory that changes with every upstream release, so a full-path match
 * would break on each bump. Case-insensitive because zip entries produced by
 * Windows tooling are not consistently cased.
 */
export function destinationFor(source: WindowsSource, memberPath: string): string | null {
  const base = path.posix.basename(memberPath.replace(/\\/g, "/")).toLowerCase();
  for (const [member, destination] of Object.entries(source.members)) {
    if (member.toLowerCase() === base) return destination;
  }
  return null;
}

/**
 * Members declared in SOURCES that the archive did not actually contain.
 *
 * Guards the failure that would otherwise reach a user: upstream reshuffles
 * an archive, extraction still reports success, and the app ships without a
 * tool that only fails when someone tries to convert something.
 */
export function missingMembers(source: WindowsSource, memberPaths: string[]): string[] {
  const found = new Set(
    memberPaths
      .map((memberPath) => destinationFor(source, memberPath))
      .filter((destination): destination is string => destination !== null),
  );
  return Object.values(source.members).filter((destination) => !found.has(destination));
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertDigest(expected: string, actual: string, name: string): void {
  if (expected.toLowerCase() === actual.toLowerCase()) return;
  throw new Error(
    `${name}: SHA-256 mismatch.\n` +
      `  expected ${expected}\n` +
      `  actual   ${actual}\n` +
      `The upstream archive changed. Review the change, then update the sha256 ` +
      `for "${name}" in scripts/vendor-binaries-win.ts.`,
  );
}
