import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { KNOWN_TOOLS, type ToolName, type Toolchain } from "./engine/toolchain";
import type { ToolStatus } from "../shared/ipc";

/**
 * Install hints for the tools the engine actually routes conversions
 * through (`KNOWN_TOOLS`), keyed by the same `ToolName`. Kept out of
 * `toolchain.ts` deliberately: that file owns *resolution*, this is
 * user-facing copy for the Formats panel.
 */
const WIRED_INSTALL_HINTS: Record<ToolName, string> = {
  imagemagick: "brew install imagemagick",
  ffmpeg: "brew install ffmpeg",
  // ffprobe ships inside the ffmpeg formula - there is no separate cask/formula.
  ffprobe: "brew install ffmpeg",
  poppler: "brew install poppler",
  pandoc: "brew install pandoc",
};

interface UnwiredTool {
  name: string;
  /** Executable name to probe for. */
  binary: string;
  installHint: string;
  /** Extra absolute paths to check, beyond the standard Homebrew prefixes. */
  extraPaths: string[];
}

/**
 * Tools the design spec lists under "detected, never bundled" that no
 * converter is wired to yet. Deliberately absent from `KNOWN_TOOLS`: the
 * engine cannot route anything through them, so folding them into the
 * resolved toolchain would make the registry claim converters it does not
 * have. The Formats panel still needs to surface them - most importantly to
 * name the LibreOffice/Office gap - so they get their own lightweight
 * presence probe here, entirely separate from `toolchain.ts`'s resolution
 * logic and never consulted by the engine.
 */
const UNWIRED_TOOLS: UnwiredTool[] = [
  {
    name: "libreoffice",
    binary: "soffice",
    installHint: "brew install --cask libreoffice",
    extraPaths: ["/Applications/LibreOffice.app/Contents/MacOS/soffice"],
  },
  {
    name: "calibre",
    binary: "ebook-convert",
    installHint: "brew install --cask calibre",
    extraPaths: ["/Applications/calibre.app/Contents/MacOS/ebook-convert"],
  },
  {
    name: "inkscape",
    binary: "inkscape",
    installHint: "brew install --cask inkscape",
    extraPaths: ["/Applications/Inkscape.app/Contents/MacOS/inkscape"],
  },
  {
    name: "vtracer",
    // vtracer is a Rust crate, not a Homebrew formula/cask - cargo installs
    // it to ~/.cargo/bin, not /opt/homebrew or /usr/local.
    binary: "vtracer",
    installHint: "cargo install vtracer (requires the Rust toolchain)",
    extraPaths: [path.join(os.homedir(), ".cargo", "bin", "vtracer")],
  },
];

function probe(binary: string, extraPaths: string[]): string | undefined {
  const candidates = [
    path.join("/opt/homebrew/bin", binary),
    path.join("/usr/local/bin", binary),
    ...extraPaths,
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * Builds the Formats panel's full tool listing: every tool the engine can
 * actually convert through (from the resolved `Toolchain`), plus the
 * known-but-unwired tools called out in the design spec, probed separately.
 * This function is presentation-only - its output never feeds back into
 * conversion routing, only into what the renderer shows the user.
 */
export function buildToolStatuses(toolchain: Toolchain): ToolStatus[] {
  const wired: ToolStatus[] = (Object.keys(KNOWN_TOOLS) as ToolName[]).map((name) => ({
    name,
    available: Boolean(toolchain[name]),
    path: toolchain[name],
    installHint: WIRED_INSTALL_HINTS[name],
  }));

  const unwired: ToolStatus[] = UNWIRED_TOOLS.map((tool) => {
    const resolved = probe(tool.binary, tool.extraPaths);
    return {
      name: tool.name,
      available: Boolean(resolved),
      path: resolved,
      installHint: tool.installHint,
    };
  });

  return [...wired, ...unwired];
}
