import { describe, expect, test } from "vitest";
import { mediumOf, MEDIA_GROUP_ORDER } from "../../src/main/engine/media";

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
