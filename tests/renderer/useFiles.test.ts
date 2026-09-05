import { describe, expect, test } from "vitest";
import { addPaths } from "../../src/renderer/useFiles";

describe("addPaths", () => {
  test("adding two distinct paths keeps both", () => {
    const result = addPaths([], ["/a/one.png", "/a/two.png"]);
    expect(result.map((f) => f.path)).toEqual(["/a/one.png", "/a/two.png"]);
  });

  test("adding the same path twice keeps one", () => {
    const result = addPaths([], ["/a/one.png", "/a/one.png"]);
    expect(result.map((f) => f.path)).toEqual(["/a/one.png"]);
  });

  test("adding a path already present alongside a new one keeps both, no duplicate", () => {
    const existing = addPaths([], ["/a/one.png"]);
    const result = addPaths(existing, ["/a/one.png", "/a/two.png"]);
    expect(result.map((f) => f.path)).toEqual(["/a/one.png", "/a/two.png"]);
  });

  test("extension is derived from the basename", () => {
    const result = addPaths([], ["/a/archive.tar.gz", "/a/README"]);
    const byPath = new Map(result.map((f) => [f.path, f]));
    expect(byPath.get("/a/archive.tar.gz")?.extension).toBe("gz");
    expect(byPath.get("/a/README")?.extension).toBe("");
  });

  test("an empty incoming list is a no-op", () => {
    const existing = addPaths([], ["/a/one.png"]);
    const result = addPaths(existing, []);
    expect(result).toBe(existing);
  });
});
