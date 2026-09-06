import { existsSync } from "node:fs";
import path from "node:path";

export type ToolName = "imagemagick" | "ffmpeg" | "ffprobe" | "poppler" | "pandoc";

export interface ToolSpec {
  /** Executable name without extension. */
  binary: string;
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
    systemPaths: {
      darwin: ["/opt/homebrew/bin/magick", "/usr/local/bin/magick"],
      win32: ["C:\\Program Files\\ImageMagick\\magick.exe"],
    },
  },
  ffmpeg: {
    binary: "ffmpeg",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"],
      win32: ["C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"],
    },
  },
  ffprobe: {
    binary: "ffprobe",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"],
      win32: ["C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe"],
    },
  },
  poppler: {
    binary: "pdftoppm",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"],
      win32: ["C:\\Program Files\\poppler\\bin\\pdftoppm.exe"],
    },
  },
  pandoc: {
    binary: "pandoc",
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

  const bundled = join(
    options.bundleDir,
    `${options.platform}-${options.arch}`,
    `${spec.binary}${ext}`,
  );
  if (exists(bundled)) return bundled;

  const systemPaths = isWindows ? spec.systemPaths.win32 : spec.systemPaths.darwin;
  for (const candidate of systemPaths) {
    if (exists(candidate)) return candidate;
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
