import path from "node:path";
import { convert as convertImagemagick, properties as propertiesImagemagick } from "./converters/imagemagick";
import { JobRunner } from "./job";
import { buildRegistry, type ConverterEntry, type Registry } from "./registry";
import {
  detectToolchain,
  isSupportedPlatform,
  KNOWN_TOOLS,
  type ToolName,
  type Toolchain,
} from "./toolchain";
import { toCommandMap } from "./exec";

const CONVERTERS: Record<string, ConverterEntry> = {
  imagemagick: {
    tool: "imagemagick",
    properties: propertiesImagemagick,
    convert: convertImagemagick,
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
