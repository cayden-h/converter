import { describe, expect, test } from "vitest";
import { shouldRelocate, rewriteTarget, planClosure, parseConfigurePaths } from "../../scripts/vendor-binaries";

describe("shouldRelocate", () => {
  test("relocates homebrew paths", () => {
    expect(shouldRelocate("/opt/homebrew/lib/libpng16.16.dylib")).toBe(true);
  });

  test("leaves system libraries alone", () => {
    // These ship with macOS and are always present. Rewriting them would
    // produce a binary that cannot find libSystem and will not launch at all.
    expect(shouldRelocate("/usr/lib/libSystem.B.dylib")).toBe(false);
    expect(shouldRelocate("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")).toBe(false);
  });

  test("leaves an already-relocated reference alone", () => {
    expect(shouldRelocate("@executable_path/../lib/libpotrace.0.dylib")).toBe(false);
    expect(shouldRelocate("@rpath/libfoo.dylib")).toBe(false);
  });
});

describe("rewriteTarget", () => {
  test("points at the lib directory beside the executable", () => {
    expect(rewriteTarget("/opt/homebrew/lib/libpng16.16.dylib")).toBe(
      "@executable_path/../lib/libpng16.16.dylib",
    );
  });

  test("uses only the basename, flattening nested homebrew paths", () => {
    // Homebrew nests under Cellar/<formula>/<version>/lib. The bundle is flat.
    expect(rewriteTarget("/opt/homebrew/Cellar/libpng/1.6.43/lib/libpng16.16.dylib")).toBe(
      "@executable_path/../lib/libpng16.16.dylib",
    );
  });
});

describe("planClosure", () => {
  const graph: Record<string, string[]> = {
    "/opt/homebrew/bin/tool": ["/opt/homebrew/lib/a.dylib", "/usr/lib/libSystem.B.dylib"],
    "/opt/homebrew/lib/a.dylib": ["/opt/homebrew/lib/b.dylib"],
    "/opt/homebrew/lib/b.dylib": ["/opt/homebrew/lib/a.dylib"],
  };

  test("walks transitively", () => {
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.libraries.sort()).toEqual(["/opt/homebrew/lib/a.dylib", "/opt/homebrew/lib/b.dylib"]);
  });

  test("terminates on a dependency cycle", () => {
    // a -> b -> a. Without a visited set this never returns.
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.libraries).toHaveLength(2);
  });

  test("excludes system libraries from the closure", () => {
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.libraries).not.toContain("/usr/lib/libSystem.B.dylib");
  });

  test("keeps executables separate from libraries", () => {
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.executables).toEqual(["/opt/homebrew/bin/tool"]);
  });
});

describe("parseConfigurePaths", () => {
  // Real `magick -list configure` output, trimmed to the relevant rows. The
  // version segment (7.1.2-31 here) changes with every Homebrew upgrade,
  // which is exactly why this is parsed rather than hardcoded.
  const output = `Path: /opt/homebrew/Cellar/imagemagick/7.1.2-31/lib/ImageMagick//config-Q16HDRI/configure.xml

Name                  Value
-------------------------------------------------------------------------------
CODER_PATH            /opt/homebrew/Cellar/imagemagick/7.1.2-31/lib/ImageMagick/modules-Q16HDRI/coders
CONFIGURE_PATH        /opt/homebrew/Cellar/imagemagick/7.1.2-31/etc/ImageMagick-7/
`;

  test("extracts both paths", () => {
    expect(parseConfigurePaths(output)).toEqual({
      coderPath: "/opt/homebrew/Cellar/imagemagick/7.1.2-31/lib/ImageMagick/modules-Q16HDRI/coders",
      configurePath: "/opt/homebrew/Cellar/imagemagick/7.1.2-31/etc/ImageMagick-7",
    });
  });

  test("strips the trailing slash CONFIGURE_PATH is emitted with", () => {
    expect(parseConfigurePaths(output).configurePath.endsWith("/")).toBe(false);
  });

  test("throws when the expected rows are missing", () => {
    expect(() => parseConfigurePaths("Name  Value\n")).toThrow();
  });
});
