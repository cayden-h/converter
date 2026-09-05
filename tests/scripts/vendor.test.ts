import { describe, expect, test } from "vitest";
import { shouldRelocate, rewriteTarget, planClosure } from "../../scripts/vendor-binaries";

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
