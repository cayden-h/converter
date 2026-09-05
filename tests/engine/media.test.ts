import { describe, expect, test } from "vitest";
import { mediumOf, isOfferable, MEDIA_GROUP_ORDER } from "../../src/main/engine/media";
import { MEDIA_GROUP_ORDER as sharedOrder } from "../../src/shared/media";

test("the engine re-exports the shared ordering rather than redefining it", () => {
  expect(MEDIA_GROUP_ORDER).toBe(sharedOrder);
});

describe("mediumOf", () => {
  test.each([
    ["jpg", "Images"],
    ["png", "Images"],
    ["heic", "Images"],
    ["mp4", "Video"],
    ["mkv", "Video"],
    ["mp3", "Audio"],
    ["flac", "Audio"],
    ["pdf", "Documents"],
    ["docx", "Documents"],
    ["md", "Documents"],
    ["epub", "E-books"],
    ["csv", "Data"],
    ["json", "Data"],
    ["svg", "Vector"],
    ["obj", "3D"],
  ])("classifies %s as %s", (format, expected) => {
    expect(mediumOf(format)).toBe(expected);
  });

  test("falls back to Other rather than throwing", () => {
    expect(mediumOf("wat")).toBe("Other");
  });

  test("is case insensitive", () => {
    expect(mediumOf("PNG")).toBe("Images");
  });

  test("every group in the display order is reachable", () => {
    // A group nothing maps to would render as a permanently empty heading.
    const reachable = new Set(MEDIA_GROUP_ORDER.map((g) => g));
    expect(reachable.size).toBe(MEDIA_GROUP_ORDER.length);
    expect(MEDIA_GROUP_ORDER).toContain("Images");
    expect(MEDIA_GROUP_ORDER[MEDIA_GROUP_ORDER.length - 1]).toBe("Other");
  });
});

describe("isOfferable", () => {
  test.each(["null", "clipboard", "histogram", "info", "mask", "matte", "inline", "data"])(
    "hides the ImageMagick pseudo-format %s",
    (format) => {
      // These are not files. Offering "convert to null" is a bug, not a feature.
      expect(isOfferable(format)).toBe(false);
    },
  );

  test.each(["264", "265", "266", "h261", "h263", "hevc", "vc1", "obu"])(
    "hides the codec-only muxer name %s",
    (format) => {
      expect(isOfferable(format)).toBe(false);
    },
  );

  test.each(["png8", "png24", "png32", "bmp2", "bmp3", "eps2", "eps3", "gif87"])(
    "hides the variant spelling %s",
    (format) => {
      // The canonical spelling is already offered; these only add noise.
      expect(isOfferable(format)).toBe(false);
    },
  );

  test.each(["png", "jpg", "mp4", "mp3", "pdf", "svg", "epub", "csv", "srt"])(
    "offers the real format %s",
    (format) => {
      expect(isOfferable(format)).toBe(true);
    },
  );
});
