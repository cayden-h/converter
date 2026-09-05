import { describe, expect, test } from "vitest";
import { createEngine, CONVERTERS, MEDIA_INPUTS } from "../../src/main/engine/index";
import { properties as imagemagick } from "../../src/main/engine/converters/imagemagick";
import { properties as ffmpeg } from "../../src/main/engine/converters/ffmpeg";
import { mediumOf, isOfferable } from "../../src/main/engine/media";

function flatten(formats: Record<string, string[]>): Set<string> {
  return new Set(Object.values(formats).flat());
}

describe("MEDIA_INPUTS data integrity", () => {
  test("every entry is actually an ffmpeg input", () => {
    // A format ffmpeg cannot READ can never be routed to ffmpeg no matter its
    // priority, so listing it here is dead weight that implies coverage which
    // does not exist. wmv and ts were both dead when this test was written.
    const ffmpegInputs = flatten(ffmpeg.from);
    const dead = [...MEDIA_INPUTS].filter((format) => !ffmpegInputs.has(format));
    expect(dead, `dead MEDIA_INPUTS entries: ${dead.join(", ")}`).toEqual([]);
  });

  test("every contested MP4-family container is claimed for ffmpeg", () => {
    // These share the container family whose ImageMagick delegate is known to
    // fail silently, producing no output file at all. If both converters claim
    // one and it is not in MEDIA_INPUTS, it routes to ImageMagick.
    const contested = [...flatten(ffmpeg.from)].filter((f) => flatten(imagemagick.from).has(f));
    const mp4Family = ["mp4", "m4v", "mov", "3gp", "3g2"].filter((f) => contested.includes(f));
    const unclaimed = mp4Family.filter((f) => !MEDIA_INPUTS.has(f));
    expect(unclaimed, `contested but routed to ImageMagick: ${unclaimed.join(", ")}`).toEqual([]);
  });
});

describe("real routing", () => {
  const engine = createEngine("/nonexistent-bundle-dir");

  test.each([
    ["mp4", "gif", "ffmpeg"],
    ["3g2", "mp4", "ffmpeg"],
    ["mov", "mp4", "ffmpeg"],
    ["wav", "mp3", "ffmpeg"],
    ["png", "jpg", "imagemagick"],
    ["heic", "jpg", "imagemagick"],
    ["gif", "png", "imagemagick"],
    ["pdf", "png", "poppler"],
    ["pdf", "txt", "poppler"],
  ])("routes %s to %s via %s", (from, to, expected) => {
    expect(engine.registry.converterFor(from, to)?.name).toBe(expected);
  });

  test("every registered converter declares a priority", () => {
    for (const [name, entry] of Object.entries(CONVERTERS)) {
      expect(entry.priority, `${name} must declare a priority`).toBeDefined();
    }
  });

  test("the offerable set is a usable size, not the whole raw table", () => {
    // A picker listing every raw format is unusable. This is a guard against
    // the junk creeping back, not an exact target.
    const engine = createEngine("/nonexistent-bundle-dir");
    const all = engine.registry.outputsFor("png");
    const offerable = all.filter(isOfferable);
    expect(offerable.length).toBeGreaterThan(40);
    expect(offerable.length).toBeLessThan(all.length / 2);
  });
});

describe("format classification coverage", () => {
  test("the common formats a user will actually pick are all classified", () => {
    // "Other" is a safety net, not a destination. If a format people convert
    // every day lands there, the picker shows it under a meaningless heading.
    const common = [
      "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "ico", "avif", "heic",
      "mp4", "mov", "mkv", "webm", "avi",
      "mp3", "wav", "flac", "aac", "ogg", "m4a",
      "pdf", "txt", "md", "html", "docx", "rtf",
      "epub", "mobi",
      "csv", "json", "yaml", "xml",
      "svg", "eps",
    ];
    const unclassified = common.filter((f) => mediumOf(f) === "Other");
    expect(unclassified, `unclassified: ${unclassified.join(", ")}`).toEqual([]);
  });
});
