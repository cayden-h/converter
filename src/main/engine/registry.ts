import { normalizeFiletype, normalizeOutputFiletype } from "./normalizeFiletype";
import { mediumOf, MEDIA_GROUP_ORDER, type Medium } from "./media";
import type { ToolName, Toolchain } from "./toolchain";
import type { ExecFileFn } from "./types";

export interface ConverterProperties {
  from: Record<string, string[]>;
  to: Record<string, string[]>;
}

export interface ConverterEntry {
  /** The tool this converter shells out to. */
  tool: ToolName;
  /**
   * Higher wins when more than one converter claims a pair.
   *
   * A function receives the NORMALIZED input format so a converter can rank
   * itself by medium. That is necessary rather than decorative: ImageMagick and
   * ffmpeg contest every common still format, and upstream's category keys
   * cannot separate them (ImageMagick files mp4 under "images"; ffmpeg files
   * everything under "muxer").
   */
  priority: number | ((input: string) => number);
  properties: ConverterProperties;
  convert: (
    filePath: string,
    fileType: string,
    convertTo: string,
    targetPath: string,
    options: unknown,
    execFileOverride?: ExecFileFn,
  ) => Promise<string>;
}

export interface ResolvedConverter extends ConverterEntry {
  name: string;
}

export interface Registry {
  /** Output formats reachable from this input, sorted and deduplicated. */
  outputsFor(input: string): string[];
  /** Output formats reachable from this input, grouped by medium for display. */
  groupedOutputsFor(input: string): { medium: Medium; formats: string[] }[];
  /** The converter that handles this pair, or null if unroutable. */
  converterFor(input: string, output: string): ResolvedConverter | null;
  /** Tools that a registered converter needs but which did not resolve. */
  missingTools(): ToolName[];
  /** Every converter whose tool resolved. */
  available(): ResolvedConverter[];
}

/**
 * Input formats are folded with normalizeFiletype (jpg -> jpeg), because that
 * is the spelling converters match on when deciding what they accept.
 */
function flattenInputs(formats: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(formats)) {
    for (const format of list) out.add(normalizeFiletype(format));
  }
  return out;
}

/**
 * Output formats are folded with normalizeOutputFiletype (jpeg -> jpg),
 * because these strings are BOTH what the picker shows the user and what the
 * produced file is named. Using the input normalizer here would offer "jpeg"
 * in the UI and then write a file called ".jpg".
 */
function flattenOutputs(formats: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(formats)) {
    for (const format of list) out.add(normalizeOutputFiletype(format));
  }
  return out;
}

function priorityOf(entry: ConverterEntry, input: string): number {
  return typeof entry.priority === "function" ? entry.priority(input) : entry.priority;
}

export function buildRegistry(
  converters: Record<string, ConverterEntry>,
  toolchain: Toolchain,
): Registry {
  const available: ResolvedConverter[] = [];
  const missing = new Set<ToolName>();

  for (const [name, entry] of Object.entries(converters)) {
    if (toolchain[entry.tool]) {
      available.push({ ...entry, name });
    } else {
      missing.add(entry.tool);
    }
  }

  const index = available.map((converter) => ({
    converter,
    from: flattenInputs(converter.properties.from),
    to: flattenOutputs(converter.properties.to),
  }));

  // Extracted so groupedOutputsFor can reuse this without relying on `this`
  // inside an object literal returned directly from this function.
  function computeOutputsFor(input: string): string[] {
    const key = normalizeFiletype(input);
    const outputs = new Set<string>();
    for (const entry of index) {
      if (!entry.from.has(key)) continue;
      for (const format of entry.to) outputs.add(format);
    }
    return [...outputs].sort();
  }

  return {
    outputsFor(input) {
      return computeOutputsFor(input);
    },

    groupedOutputsFor(input) {
      const outputs = computeOutputsFor(input);
      const groups = new Map<Medium, string[]>();
      for (const format of outputs) {
        const medium = mediumOf(format);
        const bucket = groups.get(medium);
        if (bucket) bucket.push(format);
        else groups.set(medium, [format]);
      }
      return MEDIA_GROUP_ORDER.filter((medium) => groups.has(medium)).map((medium) => ({
        medium,
        formats: groups.get(medium)!,
      }));
    },

    converterFor(input, output) {
      const from = normalizeFiletype(input);
      // Normalize the requested output the same way the `to` set was built, so
      // that both "jpg" and "jpeg" from a caller route to the same converter.
      const to = normalizeOutputFiletype(output);
      const candidates = index.filter((entry) => entry.from.has(from) && entry.to.has(to));
      if (candidates.length === 0) return null;
      let best = candidates[0]!;
      let bestPriority = priorityOf(best.converter, from);
      for (const candidate of candidates.slice(1)) {
        const priority = priorityOf(candidate.converter, from);
        if (priority > bestPriority) {
          best = candidate;
          bestPriority = priority;
        }
      }
      return best.converter;
    },

    missingTools() {
      return [...missing];
    },

    available() {
      return available;
    },
  };
}
