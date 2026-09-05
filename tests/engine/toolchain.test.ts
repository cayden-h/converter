import { describe, expect, test } from "vitest";
import { resolveTool, KNOWN_TOOLS } from "../../src/main/engine/toolchain";

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
});
