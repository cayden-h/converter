import { describe, expect, test } from "vitest";
import { buildRegistry } from "../../src/main/engine/registry";

const fakeConverter = {
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

  test("output list is sorted and deduplicated", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    const outputs = registry.outputsFor("png");
    expect(outputs).toEqual([...new Set(outputs)].sort());
  });
});
