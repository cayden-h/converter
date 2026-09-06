import { describe, expect, test } from "vitest";
import { computeFormatAvailability } from "../../src/renderer/formatAvailability";
import type { FormatGroup } from "../../src/shared/ipc";

function groups(spec: Record<string, string[]>): FormatGroup[] {
  return Object.entries(spec).map(([medium, formats]) => ({ medium, formats }));
}

describe("computeFormatAvailability", () => {
  test("one file: everything it can reach is enabled", () => {
    const result = computeFormatAvailability([groups({ Images: ["png", "webp"] })]);

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(item.enabled).toBe(true);
      expect(item.reason).toBeUndefined();
    }
    expect(result.map((r) => r.format).sort()).toEqual(["png", "webp"]);
  });

  test("two files with identical reach: everything enabled", () => {
    const perFile = [
      groups({ Images: ["png", "webp"] }),
      groups({ Images: ["png", "webp"] }),
    ];
    const result = computeFormatAvailability(perFile);

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.enabled)).toBe(true);
  });

  test("two files with partial overlap: non-shared formats present but disabled with correct N of M", () => {
    const perFile = [
      groups({ Images: ["png", "webp", "gif"] }),
      groups({ Images: ["png", "webp"] }),
    ];
    const result = computeFormatAvailability(perFile);
    const byFormat = new Map(result.map((item) => [item.format, item]));

    expect(byFormat.get("png")).toMatchObject({ enabled: true });
    expect(byFormat.get("webp")).toMatchObject({ enabled: true });

    const gif = byFormat.get("gif");
    expect(gif).toBeDefined();
    expect(gif!.enabled).toBe(false);
    expect(gif!.reason).toBe("Not available for 1 of 2 files");
  });

  test("zero files: empty result, no crash", () => {
    expect(computeFormatAvailability([])).toEqual([]);
  });

  test("a format no file can reach is absent entirely, not disabled", () => {
    const perFile = [groups({ Images: ["png"] }), groups({ Images: ["webp"] })];
    const result = computeFormatAvailability(perFile);
    const formats = result.map((item) => item.format);

    expect(formats).not.toContain("gif");
    // Both png and webp are reachable by only one of the two files, so both
    // are present but disabled - they are not absent.
    expect(formats.sort()).toEqual(["png", "webp"]);
    expect(result.every((item) => !item.enabled)).toBe(true);
  });

  test("preserves the medium a format was seen under", () => {
    const perFile = [groups({ Video: ["mp4"] })];
    const result = computeFormatAvailability(perFile);
    expect(result[0]).toMatchObject({ format: "mp4", medium: "Video", enabled: true });
  });
});
