import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
   * upstream release. A `raw` source has exactly one entry, and its key is
   * never consulted - not because destinationFor would ignore it, but
   * because main()'s raw branch takes the destination directly and never
   * calls destinationFor at all.
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
    sha256: "726c937f13770da28c329409507b072ae10e5039c1ebe1f8bc8f94ba5575d266",
    archive: "zip",
    members: { "ffmpeg.exe": "ffmpeg.exe", "ffprobe.exe": "ffprobe.exe" },
  },
  {
    name: "imagemagick",
    // The portable build is statically linked, so unlike the Homebrew build
    // there are no dlopen'd coder modules to locate and relocate - format
    // support is compiled in. Distributed as .7z, which is why main() needs
    // 7-Zip.
    //
    // The archive is FLAT: magick.exe sits at the root beside its
    // configuration XML, and ImageMagick reads that configuration from its
    // own directory. Taking only the .exe would ship a magick with no
    // delegate definitions, no font list and no MIME table, so the
    // configuration is listed here and lands in bin/ beside the binary.
    //
    // Enumerated rather than globbed so a file disappearing upstream fails
    // the build through missingMembers(). The trade is that a config file
    // ADDED upstream has to be added here by hand.
    //
    // The archive also carries compare/composite/conjure/identify/mogrify/
    // montage/stream, each a byte-identical 31MB copy of magick.exe. Taking
    // only magick.exe saves roughly 220MB.
    url: "https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-31/ImageMagick-7.1.2-31-portable-Q16-HDRI-x64.7z",
    sha256: "a6a83a77a5284a2cae5ca4a81d95e5fad21ecd56cdb647ee99f970e233504fff",
    archive: "7z",
    members: {
      "magick.exe": "magick.exe",
      "colors.xml": "colors.xml",
      "configure.xml": "configure.xml",
      "delegates.xml": "delegates.xml",
      "english.xml": "english.xml",
      "locale.xml": "locale.xml",
      "log.xml": "log.xml",
      "mime.xml": "mime.xml",
      "policy.xml": "policy.xml",
      "thresholds.xml": "thresholds.xml",
      "type.xml": "type.xml",
      "type-ghostscript.xml": "type-ghostscript.xml",
      "sRGB.icc": "sRGB.icc",
    },
  },
  {
    name: "pandoc",
    url: "https://github.com/jgm/pandoc/releases/download/3.11/pandoc-3.11-windows-x86_64.zip",
    sha256: "2ab72baf2399450e148ddf7a2a8689806c42e1bba71862b57e220fd9b8456d3d",
    archive: "zip",
    members: { "pandoc.exe": "pandoc.exe" },
  },
  {
    name: "poppler",
    url: "https://github.com/oschwartz10612/poppler-windows/releases/download/v26.07.0-0/Release-26.07.0-0.zip",
    sha256: "a711b0563b06edc488583d28198b6734c5a494afbbd1b9d87d3d2866062fb7e2",
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
    sha256: "5684e59ceaa53ce720b49efb441b0918ae99d04e8ce3f6f753664524592d67f1",
    archive: "zip",
    members: { "resvg.exe": "resvg.exe" },
  },
  {
    name: "dasel",
    url: "https://github.com/TomWright/dasel/releases/download/v3.11.2/dasel_windows_amd64.exe",
    sha256: "7f37a5aba88c702884edca3bcf2ad0a67b3f2533cbfbf1f6bc414e25e2fe1d24",
    archive: "raw",
    members: { "dasel_windows_amd64.exe": "dasel.exe" },
  },
  {
    name: "potrace",
    url: "https://potrace.sourceforge.net/download/1.16/potrace-1.16.win64.zip",
    sha256: "63699f9885b5ed053977fd94452a7bdbb77ee62b77bf28a3f17b2f14b9b9c65d",
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

/**
 * Fails unless the downloaded bytes match the pin.
 *
 * Argument order matters and is NOT type-checked: `expected` is the digest
 * recorded in SOURCES, `actual` is the digest of what was just downloaded.
 * Transposing them still throws, but reports the mismatch backwards and
 * sends the reader to the wrong side of the problem.
 */
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

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Extracts an archive into `into` and returns its member paths, relative to
 * `into`.
 *
 * Both zip and 7z go through 7-Zip. GitHub's windows-latest runners ship it
 * preinstalled, and one extractor for both keeps the two formats on the same
 * code path rather than pulling in a zip library for six sources and shelling
 * out for the seventh anyway.
 */
function extract(archivePath: string, into: string): string[] {
  execFileSync(sevenZip(), ["x", "-y", `-o${into}`, archivePath], { stdio: "pipe" });
  return walk(into).map((file) => path.relative(into, file));
}

function sevenZip(): string {
  // A bare ENOENT from execFileSync names only "7z" and gives no hint about
  // what to install, which is a poor failure for something that only bites
  // on a developer machine.
  try {
    execFileSync("7z", ["i"], { stdio: "pipe" });
    return "7z";
  } catch {
    throw new Error(
      "7-Zip not found on PATH. It is preinstalled on GitHub's windows-latest " +
        "runners; locally, install it with `winget install 7zip.7zip`.",
    );
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Downloads every source and prints its digest without extracting anything.
 *
 * This is the bootstrap for the `sha256` fields, and the recovery path when
 * one of the mutable upstream URLs legitimately changes. It touches only the
 * network, so it runs anywhere - including the Mac this project is developed
 * on, which cannot run the extraction half.
 */
async function printDigests(): Promise<void> {
  for (const source of SOURCES) {
    const bytes = await download(source.url);
    console.log(`${sha256Of(bytes)}  ${source.name}  (${formatBytes(bytes.byteLength)})`);
  }
  console.log("\nPaste each digest into the matching SOURCES entry in scripts/vendor-binaries-win.ts.");
}

async function main(): Promise<void> {
  if (process.argv.includes("--print-digests")) {
    await printDigests();
    return;
  }

  if (process.platform !== "win32") {
    // The downloads would work anywhere, but the extracted files are Windows
    // executables. Running this on a Mac would leave a win32-x64 directory
    // that the macOS packaging step would then happily ship.
    throw new Error(
      "vendor-binaries-win.ts extracts Windows executables and must run on Windows. " +
        "Use `npm run digests:win` if you only need to refresh the digests.",
    );
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bundleRoot = path.join(repoRoot, "resources", "bin", "win32-x64");
  const binDir = path.join(bundleRoot, "bin");

  const staging = mkdtempSync(path.join(tmpdir(), "converter-vendor-win-"));
  const stagedBin = path.join(staging, "bin");
  mkdirSync(stagedBin, { recursive: true });

  try {
    for (const source of SOURCES) {
      const bytes = await download(source.url);
      assertDigest(source.sha256, sha256Of(bytes), source.name);

      if (source.archive === "raw") {
        // A bare .exe, not an archive. There is exactly one member and its
        // destination is the only thing that matters, so this path never
        // consults destinationFor.
        const destination = Object.values(source.members)[0];
        if (destination === undefined) {
          throw new Error(`${source.name}: a raw source needs exactly one members entry.`);
        }
        writeFileSync(path.join(stagedBin, destination), bytes);
        console.log(`${source.name}: ${destination} (${formatBytes(bytes.byteLength)})`);
        continue;
      }

      const archiveDir = mkdtempSync(path.join(staging, `${source.name}-`));
      const archivePath = path.join(archiveDir, path.basename(new URL(source.url).pathname));
      writeFileSync(archivePath, bytes);

      const extractRoot = path.join(archiveDir, "unpacked");
      mkdirSync(extractRoot, { recursive: true });
      const members = extract(archivePath, extractRoot);
      if (members.length === 0) {
        throw new Error(`${source.name}: the archive extracted no files at all.`);
      }

      const absent = missingMembers(source, members);
      if (absent.length > 0) {
        throw new Error(
          `${source.name}: the archive did not contain ${absent.join(", ")}. ` +
            `Upstream reshuffled its layout - update the members map in SOURCES.`,
        );
      }

      for (const member of members) {
        const destination = destinationFor(source, member);
        if (destination === null) continue;
        writeFileSync(path.join(stagedBin, destination), readFileSync(path.join(extractRoot, member)));
        console.log(`${source.name}: ${destination}`);
      }
    }

    // Only now is the previous bundle replaced. Everything above wrote into a
    // temp directory, so a digest mismatch or a failed extraction leaves the
    // last known-good bundle exactly as it was - a partially vendored bin/
    // would otherwise be packaged by electron-builder without complaint, and
    // the first thing to notice would be a user's conversion failing.
    rmSync(bundleRoot, { recursive: true, force: true });
    mkdirSync(bundleRoot, { recursive: true });
    cpSync(stagedBin, binDir, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  const files = readdirSync(binDir);
  const total = files.reduce((sum, file) => sum + statSync(path.join(binDir, file)).size, 0);
  console.log(`\nVendored ${files.length} files, ${formatBytes(total)} total.`);
}

// The same identity check scripts/vendor-binaries.ts uses. A substring test
// on argv[1] would also fire when the script is reached through any wrapper
// path that happens to contain its name; comparing resolved paths will not.
const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
