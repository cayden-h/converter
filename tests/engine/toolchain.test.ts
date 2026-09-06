import { describe, expect, test } from "vitest";
import {
  resolveTool,
  detectToolchain,
  isSupportedPlatform,
  KNOWN_TOOLS,
} from "../../src/main/engine/toolchain";

describe("resolveTool", () => {
  test("returns the bundled path when the bundled binary exists", () => {
    const exists = (p: string) => p === "/bundle/bin/darwin-arm64/magick";
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists,
    });
    expect(result).toBe("/bundle/bin/darwin-arm64/magick");
  });

  test("falls back to a known system path when not bundled", () => {
    const exists = (p: string) => p === "/opt/homebrew/bin/magick";
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists,
    });
    expect(result).toBe("/opt/homebrew/bin/magick");
  });

  test("returns null when the tool is nowhere", () => {
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: () => false,
    });
    expect(result).toBeNull();
  });

  test("builds the win32 bundled path with backslashes and an .exe suffix", () => {
    // Asserts the FULL path, not just a substring. A `toContain("magick.exe")`
    // check here would pass even if the separators were wrong, which is the
    // exact bug this test exists to catch when running on a non-Windows host.
    const seen: string[] = [];
    resolveTool("imagemagick", {
      platform: "win32",
      arch: "x64",
      bundleDir: "C:\\app\\bin",
      exists: (p) => {
        seen.push(p);
        return false;
      },
    });
    expect(seen[0]).toBe("C:\\app\\bin\\win32-x64\\magick.exe");
  });

  test("builds the darwin bundled path with forward slashes and no suffix", () => {
    const seen: string[] = [];
    resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => {
        seen.push(p);
        return false;
      },
    });
    expect(seen[0]).toBe("/bundle/bin/darwin-arm64/magick");
  });

  test("prefers the bundled binary over a system one", () => {
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: () => true,
    });
    expect(result).toBe("/bundle/bin/darwin-arm64/magick");
  });

  test("every known tool declares a binary name", () => {
    for (const [name, spec] of Object.entries(KNOWN_TOOLS)) {
      expect(spec.binary, `${name} must declare a binary`).toBeTruthy();
    }
  });

  test("tries the second system path when the first is absent", () => {
    // Without this, code that ignored `exists` and always returned
    // systemPaths[0], or that iterated in reverse, would still pass every
    // other test in this file. This is the only case that exercises the loop
    // past its first iteration.
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/usr/local/bin/magick",
    });
    expect(result).toBe("/usr/local/bin/magick");
  });
});

describe("detectToolchain", () => {
  test("omits tools that did not resolve rather than storing null", () => {
    // exec.ts does a truthy check on these entries, so an unresolved tool must
    // be ABSENT from the map, not present with a null value.
    const toolchain = detectToolchain({
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/ffmpeg",
    });
    expect(toolchain).toEqual({ ffmpeg: "/opt/homebrew/bin/ffmpeg" });
    expect("imagemagick" in toolchain).toBe(false);
  });

  test("resolves every known tool when all are present", () => {
    const toolchain = detectToolchain({
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: () => true,
    });
    expect(Object.keys(toolchain).sort()).toEqual(Object.keys(KNOWN_TOOLS).sort());
  });
});

describe("isSupportedPlatform", () => {
  test("accepts darwin and win32, rejects everything else", () => {
    expect(isSupportedPlatform("darwin")).toBe(true);
    expect(isSupportedPlatform("win32")).toBe(true);
    expect(isSupportedPlatform("linux")).toBe(false);
    expect(isSupportedPlatform("Darwin")).toBe(false);
  });
});

describe("multi-binary tool suites", () => {
  test("resolves a named binary from a suite", () => {
    const result = resolveTool("poppler", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/pdftoppm",
      binary: "pdftoppm",
    });
    expect(result).toBe("/opt/homebrew/bin/pdftoppm");
  });

  test("resolves a sibling binary from the same suite directory", () => {
    // pdftotext lives beside pdftoppm. One entry must cover both, or the
    // platform paths get duplicated per binary.
    const result = resolveTool("poppler", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/pdftotext",
      binary: "pdftotext",
    });
    expect(result).toBe("/opt/homebrew/bin/pdftotext");
  });

  test("defaults to the suite's primary binary when none is named", () => {
    const result = resolveTool("poppler", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/pdftoppm",
    });
    expect(result).toBe("/opt/homebrew/bin/pdftoppm");
  });

  test("every suite lists its primary binary first", () => {
    for (const [name, spec] of Object.entries(KNOWN_TOOLS)) {
      expect(spec.binaries[0], `${name} must list a primary binary first`).toBe(spec.binary);
    }
  });
});
