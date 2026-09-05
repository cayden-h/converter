import { normalizeFiletype } from "./normalizeFiletype";
import type { ToolName, Toolchain } from "./toolchain";
import type { ExecFileFn } from "./types";

export interface ConverterProperties {
  from: Record<string, string[]>;
  to: Record<string, string[]>;
}

export interface ConverterEntry {
  /** The tool this converter shells out to. */
  tool: ToolName;
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
  /** The converter that handles this pair, or null if unroutable. */
  converterFor(input: string, output: string): ResolvedConverter | null;
  /** Tools that a registered converter needs but which did not resolve. */
  missingTools(): ToolName[];
  /** Every converter whose tool resolved. */
  available(): ResolvedConverter[];
}

function flatten(formats: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(formats)) {
    for (const format of list) out.add(normalizeFiletype(format));
  }
  return out;
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
    from: flatten(converter.properties.from),
    to: flatten(converter.properties.to),
  }));

  return {
    outputsFor(input) {
      const key = normalizeFiletype(input);
      const outputs = new Set<string>();
      for (const entry of index) {
        if (!entry.from.has(key)) continue;
        for (const format of entry.to) outputs.add(format);
      }
      return [...outputs].sort();
    },

    converterFor(input, output) {
      const from = normalizeFiletype(input);
      const to = normalizeFiletype(output);
      for (const entry of index) {
        if (entry.from.has(from) && entry.to.has(to)) return entry.converter;
      }
      return null;
    },

    missingTools() {
      return [...missing];
    },

    available() {
      return available;
    },
  };
}
