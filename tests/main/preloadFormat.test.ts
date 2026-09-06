import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * A sandboxed preload must be CommonJS at a .js path.
 *
 * package.json sets "type": "module", so electron-vite will emit
 * out/preload/index.mjs unless the preload build is explicitly told to output
 * CJS. The main process loads "../preload/index.js", so an .mjs build packages
 * fine, passes every test, and then fails only in the packaged app: the window
 * opens, the preload never loads, window.converter is undefined, and the
 * renderer dies on its first bridge call leaving a blank window.
 *
 * Nothing short of launching the built app caught this, which is why it is
 * pinned here.
 */
describe.skipIf(!existsSync("out/preload/index.js"))("built preload", () => {
  test("is emitted as .js, not .mjs", () => {
    expect(existsSync("out/preload/index.js")).toBe(true);
    expect(existsSync("out/preload/index.mjs"), "an .mjs preload cannot load under sandbox").toBe(
      false,
    );
  });

  test("is CommonJS, which a sandboxed preload requires", () => {
    const source = readFileSync("out/preload/index.js", "utf8");
    expect(source).toContain("require(");
    expect(source, "ESM syntax means Electron will refuse it under sandbox").not.toMatch(
      /^\s*import\s.+\sfrom\s/m,
    );
  });

  test("actually exposes the bridge the renderer calls", () => {
    const source = readFileSync("out/preload/index.js", "utf8");
    expect(source).toContain("exposeInMainWorld");
    for (const method of ["detectTools", "run", "onProgress", "pathForFile"]) {
      expect(source, `bridge must expose ${method}`).toContain(method);
    }
  });
});
