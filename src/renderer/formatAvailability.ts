import type { FormatGroup } from "../shared/ipc";

export interface AvailableFormat {
  format: string;
  medium: string;
  enabled: boolean;
  /** Set only when `enabled` is false: "Not available for N of M files". */
  reason?: string;
}

/**
 * Computes the format picker's contents for a set of selected files.
 *
 * Each element of `perFileGroups` is one file's `groupedOutputsFor` result.
 * A format is OFFERED if at least one file can reach it, but ENABLED only if
 * every file can reach it. A format reachable by some files but not all is
 * still shown (so the user can see it exists) but disabled, with a reason
 * naming how many of the selected files cannot reach it.
 *
 * Pure and side-effect free so the intersection logic - the one part of the
 * picker that is real logic rather than presentation - can be unit tested
 * without mounting anything.
 */
export function computeFormatAvailability(perFileGroups: FormatGroup[][]): AvailableFormat[] {
  const total = perFileGroups.length;
  if (total === 0) return [];

  const mediumByFormat = new Map<string, string>();
  const countByFormat = new Map<string, number>();

  for (const groups of perFileGroups) {
    // A single file's groupedOutputsFor result should not list a format
    // twice, but guard against double-counting one file's reach if it did.
    const reachableByThisFile = new Set<string>();
    for (const group of groups) {
      for (const format of group.formats) {
        reachableByThisFile.add(format);
        if (!mediumByFormat.has(format)) mediumByFormat.set(format, group.medium);
      }
    }
    for (const format of reachableByThisFile) {
      countByFormat.set(format, (countByFormat.get(format) ?? 0) + 1);
    }
  }

  const result: AvailableFormat[] = [];
  for (const [format, count] of countByFormat) {
    const medium = mediumByFormat.get(format)!;
    if (count === total) {
      result.push({ format, medium, enabled: true });
    } else {
      const missing = total - count;
      result.push({
        format,
        medium,
        enabled: false,
        reason: `Not available for ${missing} of ${total} files`,
      });
    }
  }
  return result;
}
