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

export interface ResolveOptions {
  platform: string;
  arch: string;
  bundleDir: string;
  exists?: (p: string) => boolean;
}

export function resolveTool(name: ToolName, options: ResolveOptions): string | null {
  const spec = KNOWN_TOOLS[name];
  const exists = options.exists ?? existsSync;
  const ext = options.platform === "win32" ? ".exe" : "";

  const bundled = path.join(
    options.bundleDir,
    `${options.platform}-${options.arch}`,
    `${spec.binary}${ext}`,
  );
  if (exists(bundled)) return bundled;

  const systemPaths =
    options.platform === "win32" ? spec.systemPaths.win32 : spec.systemPaths.darwin;
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
