import path from "node:path";
import { convert as convertImagemagick, properties as propertiesImagemagick } from "./converters/imagemagick";
import { convert as convertFfmpeg, properties as propertiesFfmpeg } from "./converters/ffmpeg";
import { convert as convertPoppler, properties as propertiesPoppler } from "./converters/poppler";
import { convert as convertPandoc, properties as propertiesPandoc } from "./converters/pandoc";
import { convert as convertResvg, properties as propertiesResvg } from "./converters/resvg";
import { convert as convertDasel, properties as propertiesDasel } from "./converters/dasel";
import { convert as convertPotrace, properties as propertiesPotrace } from "./converters/potrace";
import { convert as convertRasterTrace, properties as propertiesRasterTrace } from "./converters/rasterTrace";
import { convert as convertElectronPdf, properties as propertiesElectronPdf } from "./converters/electronPdf";
import { renderPdf } from "../pdf";
import { JobRunner } from "./job";
import { buildRegistry, type ConverterEntry, type Registry } from "./registry";
import {
  detectToolchain,
  isSupportedPlatform,
  KNOWN_TOOLS,
  type ToolName,
  type Toolchain,
} from "./toolchain";
import { toCommandMap, toFfmpegExecFile } from "./exec";

/**
 * Input formats ffmpeg should own outright. Upstream's category keys cannot be
 * used for this: ImageMagick lists mp4 under "images" and ffmpeg lists
 * everything under "muxer", so the medium classification has to be ours.
 *
 * Every entry must appear in ffmpeg's own `from` table - a format ffmpeg cannot
 * read can never route to it, so a dead entry only implies coverage that does
 * not exist. tests/engine/routing.test.ts enforces this against the real table.
 *
 * Deliberately absent: `wmv` and `ts`. ffmpeg's lifted table lists them as
 * OUTPUT formats only, so ffmpeg is never a candidate for them as input. `.wmv`
 * currently routes to ImageMagick; `.ts` is readable by neither converter and
 * so cannot be converted at all. Both are coverage gaps inherited from
 * upstream's tables, not routing bugs, and are recorded in the plan.
 */
export const MEDIA_INPUTS = new Set([
  "mp4", "mov", "mkv", "avi", "webm", "flv", "m4v", "mpg", "mpeg", "3gp", "3g2",
  "mp3", "wav", "flac", "aac", "ogg", "opus", "m4a", "wma", "aiff",
]);

export const CONVERTERS: Record<string, ConverterEntry> = {
  // Highest priority overall. It must beat pandoc for md -> pdf and html ->
  // pdf: pandoc also claims md -> pdf, but only by delegating to a LaTeX
  // engine this app does not ship, so pandoc's PDF path fails at runtime
  // while this one, built on Electron's own Chromium, actually works.
  electronPdf: {
    // Declares pandoc rather than nothing: markdown input genuinely needs
    // pandoc to get to HTML first (see electronPdf.ts), so the stricter
    // dependency is the honest one - html -> pdf never touches pandoc, but
    // offering the converter only when pandoc is present costs nothing and
    // keeps the "every tool this converter might call" invariant intact.
    tools: ["pandoc"],
    priority: 40,
    properties: propertiesElectronPdf,
    convert: (filePath, fileType, convertTo, targetPath, options, execFileOverride) =>
      convertElectronPdf(filePath, fileType, convertTo, targetPath, options, execFileOverride, renderPdf),
  },
  // Highest priority for PDF input: ImageMagick can read PDFs only through a
  // ghostscript delegate that is often absent, and it rasterizes badly.
  poppler: {
    tools: ["poppler"],
    priority: 30,
    properties: propertiesPoppler,
    convert: convertPoppler,
  },
  // Must beat ImageMagick, which also claims svg as an output format but
  // produces an svg with an embedded bitmap rather than real vector paths.
  // rasterTrace is the one that actually traces.
  rasterTrace: {
    tools: ["imagemagick", "potrace"],
    priority: 25,
    properties: propertiesRasterTrace,
    convert: convertRasterTrace,
  },
  // ffmpeg wins when the INPUT is a video or audio container, and yields on
  // stills. A constant would be wrong in both directions: ranking it above
  // ImageMagick reroutes png -> jpg through ffmpeg, and ranking it below sends
  // mp4 -> gif to ImageMagick, whose mp4 delegate is frequently broken.
  ffmpeg: {
    tools: ["ffmpeg"],
    priority: (input: string) => (MEDIA_INPUTS.has(input) ? 30 : 5),
    properties: propertiesFfmpeg,
    convert: (filePath, fileType, convertTo, targetPath, options, execFileOverride) =>
      convertFfmpeg(
        filePath,
        fileType,
        convertTo,
        targetPath,
        options,
        execFileOverride ? (toFfmpegExecFile(execFileOverride) as never) : undefined,
      ),
  },
  // Must beat ImageMagick for svg input: resvg exists specifically to
  // rasterize svg correctly, where ImageMagick's own svg delegate is
  // inconsistent.
  resvg: {
    tools: ["resvg"],
    priority: 15,
    properties: propertiesResvg,
    convert: convertResvg,
  },
  imagemagick: {
    tools: ["imagemagick"],
    priority: 10,
    properties: propertiesImagemagick,
    convert: convertImagemagick,
  },
  // Declared before pandoc: pandoc's own tables also claim csv -> json (via
  // its generic reader/writer pair), and both sit at priority 10 by design -
  // ties go to whichever candidate the registry sees first, so dasel, the
  // tool actually built for structured data, must come first in this object.
  dasel: {
    tools: ["dasel"],
    priority: 10,
    properties: propertiesDasel,
    convert: convertDasel,
  },
  pandoc: {
    tools: ["pandoc"],
    priority: 10,
    properties: propertiesPandoc,
    convert: convertPandoc,
  },
  potrace: {
    tools: ["potrace"],
    priority: 10,
    properties: propertiesPotrace,
    convert: convertPotrace,
  },
};

export interface Engine {
  registry: Registry;
  toolchain: Toolchain;
  runner: JobRunner;
}

export function createEngine(bundleDir: string): Engine {
  // ResolveOptions.platform is narrowed to the platforms we actually ship, so
  // an unsupported OS fails here with a clear message instead of silently
  // resolving macOS paths.
  if (!isSupportedPlatform(process.platform)) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  const toolchain = detectToolchain({
    platform: process.platform,
    arch: process.arch,
    bundleDir,
  });


  const registry = buildRegistry(CONVERTERS, toolchain);

  // Rekeys tool names to binary names. See toCommandMap's doc comment for why
  // skipping this silently breaks every conversion.
  const commands = toCommandMap(toolchain);

  const runner = new JobRunner(registry, {
    commands,
    outputDirFor: (inputPath) => path.dirname(inputPath),
  });

  return { registry, toolchain, runner };
}
