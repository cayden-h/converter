import { KNOWN_TOOLS, DETECTABLE_TOOLS, resolveDetectable, type ToolName, type Toolchain } from "./engine/toolchain";
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
  resvg: "brew install resvg",
  dasel: "brew install dasel",
  potrace: "brew install potrace",
};

/**
 * Install hints for the tools the design spec lists under "detected, never
 * bundled" that no converter is wired to yet (`DETECTABLE_TOOLS` in
 * toolchain.ts). Deliberately absent from `KNOWN_TOOLS`: the engine cannot
 * route anything through them, so folding them into the resolved toolchain
 * would make the registry claim converters it does not have. The Formats
 * panel still needs to surface them - most importantly to name the
 * LibreOffice/Office gap. This is presentation-only copy; path resolution
 * lives entirely in toolchain.ts, per the rule on ToolSpec there.
 */
const DETECTABLE_INSTALL_HINTS: Record<string, string> = {
  libreoffice: "brew install --cask libreoffice",
  calibre: "brew install --cask calibre",
  inkscape: "brew install --cask inkscape",
  // vtracer is a Rust crate, not a Homebrew formula/cask.
  vtracer: "cargo install vtracer (requires the Rust toolchain)",
};

/**
 * Builds the Formats panel's full tool listing: every tool the engine can
 * actually convert through (from the resolved `Toolchain`), plus the
 * known-but-unwired tools called out in the design spec, resolved via
 * `resolveDetectable`. This function is presentation-only - its output never
 * feeds back into conversion routing, only into what the renderer shows the
 * user.
 */
export function buildToolStatuses(toolchain: Toolchain): ToolStatus[] {
  const wired: ToolStatus[] = (Object.keys(KNOWN_TOOLS) as ToolName[]).map((name) => ({
    name,
    available: Boolean(toolchain[name]),
    path: toolchain[name],
    installHint: WIRED_INSTALL_HINTS[name],
  }));

  const unwired: ToolStatus[] = Object.keys(DETECTABLE_TOOLS).map((name) => {
    const resolved = resolveDetectable(name, {
      platform: process.platform === "win32" ? "win32" : "darwin",
      arch: process.arch,
      bundleDir: "",
    });
    return {
      name,
      available: Boolean(resolved),
      path: resolved ?? undefined,
      installHint: DETECTABLE_INSTALL_HINTS[name],
    };
  });

  return [...wired, ...unwired];
}
