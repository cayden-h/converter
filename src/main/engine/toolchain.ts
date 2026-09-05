import { existsSync } from "node:fs";
import path from "node:path";

export type ToolName = "imagemagick" | "ffmpeg" | "ffprobe" | "poppler" | "pandoc";

export interface ToolSpec {
  /** Primary executable name, without extension. Also the CommandMap key. */
  binary: string;
  /**
   * Every executable this tool provides, primary first. Most tools have one.
   * Poppler is a suite: pdftoppm, pdftotext and pdfimages ship together in the
   * same directory, and listing them here keeps their platform paths in one
   * entry instead of fragmenting them across three.
   */
  binaries: readonly string[];
  /**
   * Known absolute install locations per platform, searched in order after
   * the bundled directory. This object is the ONLY place in the codebase
   * that may contain a platform-specific path.
   */
  systemPaths: { darwin: string[]; win32: string[] };
}

export const KNOWN_TOOLS: Record<ToolName, ToolSpec> = {
  imagemagick: {
    binary: "magick",
    binaries: ["magick"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/magick", "/usr/local/bin/magick"],
      win32: ["C:\\Program Files\\ImageMagick\\magick.exe"],
    },
  },
  ffmpeg: {
    binary: "ffmpeg",
    binaries: ["ffmpeg"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"],
      win32: ["C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"],
    },
  },
  ffprobe: {
    binary: "ffprobe",
    binaries: ["ffprobe"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"],
      win32: ["C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe"],
    },
  },
  poppler: {
    binary: "pdftoppm",
    binaries: ["pdftoppm", "pdftotext", "pdfimages"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"],
      win32: ["C:\\Program Files\\poppler\\bin\\pdftoppm.exe"],
    },
  },
  pandoc: {
    binary: "pandoc",
    binaries: ["pandoc"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"],
      win32: ["C:\\Program Files\\Pandoc\\pandoc.exe"],
    },
  },
};

/** The only platforms this app resolves tools for. Linux is out of scope. */
export type SupportedPlatform = "darwin" | "win32";

export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return platform === "darwin" || platform === "win32";
}

export interface ResolveOptions {
  platform: SupportedPlatform;
  arch: string;
  bundleDir: string;
  exists?: (p: string) => boolean;
  /** Which binary of a suite to resolve. Defaults to the tool's primary. */
  binary?: string;
}

export function resolveTool(name: ToolName, options: ResolveOptions): string | null {
  const spec = KNOWN_TOOLS[name];
  const exists = options.exists ?? existsSync;
  const isWindows = options.platform === "win32";

  // Join with the TARGET platform's separator, not the host's. Plain
  // `path.join` uses whichever flavor the running machine has, which would
  // build "C:\\app\\bin/win32-x64/magick.exe" when resolving a Windows
  // path from a Mac.
  const join = isWindows ? path.win32.join : path.posix.join;
  const ext = isWindows ? ".exe" : "";

  const wanted = options.binary ?? spec.binary;
  if (!spec.binaries.includes(wanted)) return null;

  const bundled = join(
    options.bundleDir,
    `${options.platform}-${options.arch}`,
    `${wanted}${ext}`,
  );
  if (exists(bundled)) return bundled;

  const systemPaths = isWindows ? spec.systemPaths.win32 : spec.systemPaths.darwin;
  for (const candidate of systemPaths) {
    // systemPaths are written against the primary binary; a suite's siblings
    // live in the same directory.
    const dir = isWindows ? path.win32.dirname(candidate) : path.posix.dirname(candidate);
    const resolved = join(dir, `${wanted}${ext}`);
    if (exists(resolved)) return resolved;
  }

  return null;
}

export type Toolchain = Partial<Record<ToolName, string>>;

export function detectToolchain(options: ResolveOptions): Toolchain {
  const result: Toolchain = {};
  for (const name of Object.keys(KNOWN_TOOLS) as ToolName[]) {
    const resolved = resolveTool(name, options);
    if (resolved) result[name] = resolved;
  }
  return result;
}
