import { describe, expect, test } from "vitest";
import { buildRegistry } from "../../src/main/engine/registry";
import { normalizeOutputFiletype } from "../../src/main/engine/normalizeFiletype";

const fakeConverter = {
  priority: 10,
  properties: {
    from: { images: ["png", "jpeg", "heic"] },
    to: { images: ["png", "jpeg", "webp"] },
  },
  convert: async () => "Done",
};

describe("buildRegistry", () => {
  test("omits a converter whose tool did not resolve", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      {},
    );
    expect(registry.outputsFor("png")).toEqual([]);
  });

  test("includes a converter whose tool resolved", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.outputsFor("png")).toContain("webp");
  });

  test("normalizes the input extension before lookup", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.outputsFor("JPG")).toContain("webp");
  });

  test("returns an empty list for an unsupported input", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.outputsFor("xyz")).toEqual([]);
  });

  test("finds the converter for a supported pair", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("png", "webp")?.name).toBe("imagemagick");
  });

  test("returns null for an unroutable pair", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("png", "mp4")).toBeNull();
  });

  test("reports which tools are missing", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      {},
    );
    expect(registry.missingTools()).toEqual(["imagemagick"]);
  });

  test("offers jpg, not jpeg, so the picker matches the produced filename", () => {
    // Regression guard. The registry once folded outputs with the INPUT
    // normalizer, so it advertised "jpeg" while the written file was ".jpg".
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    const outputs = registry.outputsFor("png");
    expect(outputs).toContain("jpg");
    expect(outputs).not.toContain("jpeg");
  });

  test("advertises only strings already in produced-filename form", () => {
    // The strings the picker shows BECOME the file's extension. Advertising a
    // spelling that normalizeOutputFiletype would rewrite means the UI and the
    // file on disk disagree.
    //
    // This is the load-bearing regression guard. The smoke test below asserts
    // only that both spellings route, which passed against the BUGGY
    // implementation too - there both folded to "jpeg" and the buggy index
    // also held "jpeg", so it matched by coincidence.
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    for (const output of registry.outputsFor("png")) {
      expect(normalizeOutputFiletype(output), `advertised "${output}"`).toBe(output);
    }
  });

  test("routes both jpg and jpeg spellings to the same converter", () => {
    // Smoke test only. It cannot fail independently of the invariant above -
    // do not treat it as regression coverage on its own.
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("png", "jpg")?.name).toBe("imagemagick");
    expect(registry.converterFor("png", "jpeg")?.name).toBe("imagemagick");
  });

  test("output list is sorted and deduplicated", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    const outputs = registry.outputsFor("png");
    expect(outputs).toEqual([...new Set(outputs)].sort());
  });

  test("prefers the higher-priority converter when both claim a pair", () => {
    // ImageMagick and ffmpeg overlap on 45 output formats. Without an explicit
    // policy this is decided by Object.entries() order, which is invisible and
    // silently reorderable by anyone editing the converters record.
    const stills = {
      tool: "imagemagick" as const,
      priority: 10,
      properties: { from: { images: ["gif"] }, to: { images: ["png"] } },
      convert: async () => "stills",
    };
    const motion = {
      tool: "ffmpeg" as const,
      priority: 20,
      properties: { from: { video: ["gif"] }, to: { video: ["png"] } },
      convert: async () => "motion",
    };
    const registry = buildRegistry(
      { imagemagick: stills, ffmpeg: motion },
      { imagemagick: "/bin/magick", ffmpeg: "/bin/ffmpeg" },
    );
    expect(registry.converterFor("gif", "png")?.name).toBe("ffmpeg");
  });

  test("priority beats declaration order in both directions", () => {
    // Same two converters, reversed in the record. If the result changed, the
    // policy would still secretly be insertion order.
    const stills = {
      tool: "imagemagick" as const,
      priority: 10,
      properties: { from: { images: ["gif"] }, to: { images: ["png"] } },
      convert: async () => "stills",
    };
    const motion = {
      tool: "ffmpeg" as const,
      priority: 20,
      properties: { from: { video: ["gif"] }, to: { video: ["png"] } },
      convert: async () => "motion",
    };
    const forward = buildRegistry(
      { imagemagick: stills, ffmpeg: motion },
      { imagemagick: "/bin/magick", ffmpeg: "/bin/ffmpeg" },
    );
    const reversed = buildRegistry(
      { ffmpeg: motion, imagemagick: stills },
      { imagemagick: "/bin/magick", ffmpeg: "/bin/ffmpeg" },
    );
    expect(forward.converterFor("gif", "png")?.name).toBe("ffmpeg");
    expect(reversed.converterFor("gif", "png")?.name).toBe("ffmpeg");
  });

  test("falls back to the available converter when the preferred tool is missing", () => {
    const stills = {
      tool: "imagemagick" as const,
      priority: 10,
      properties: { from: { images: ["gif"] }, to: { images: ["png"] } },
      convert: async () => "stills",
    };
    const motion = {
      tool: "ffmpeg" as const,
      priority: 20,
      properties: { from: { video: ["gif"] }, to: { video: ["png"] } },
      convert: async () => "motion",
    };
    const registry = buildRegistry(
      { imagemagick: stills, ffmpeg: motion },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("gif", "png")?.name).toBe("imagemagick");
  });
});
