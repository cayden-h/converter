import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const BUNDLE = path.resolve("resources/bin/darwin-arm64");
const MAGICK = path.join(BUNDLE, "bin/magick");

/**
 * The bundled ImageMagick is built from source with `--without-modules`.
 *
 * Homebrew's build is modular: every format coder is a separate .so that
 * libMagickCore dlopen's from a path compiled in at build time. Those modules
 * are invisible to `otool -L`, so the dylib closure never found them - and
 * once relocated with install_name_tool, the binary could not load them at
 * all. It ran, reported its version correctly, and knew ZERO formats.
 *
 * A non-modular build compiles every coder into libMagickCore. Nothing is
 * dlopen'd, so nothing can fail to load after relocation.
 */
describe.skipIf(!existsSync(MAGICK))("bundled ImageMagick", () => {
  function formatCount(env: NodeJS.ProcessEnv = {}): number {
    const output = execFileSync(MAGICK, ["-list", "format"], { encoding: "utf8", env });
    return output.split("\n").filter((line) => /^ +[A-Z0-9]+/.test(line)).length;
  }

  test("knows its formats with NO environment at all", () => {
    // The assertion that matters. A magick that resolves, runs, and reports
    // --version correctly can still know zero formats and convert nothing.
    expect(formatCount()).toBeGreaterThan(100);
  });

  test("is not modular, so no coder path can break it", () => {
    // Under the previous modular build, pointing this at a bad path dropped
    // the count to zero. A compiled-in build is immune, which is the whole
    // reason for building from source.
    expect(formatCount({ MAGICK_CODER_MODULE_PATH: "/nonexistent" })).toBeGreaterThan(100);
    const configure = execFileSync(MAGICK, ["-list", "configure"], { encoding: "utf8" });
    expect(configure).not.toMatch(/FEATURES.*Modules/);
  });

  test("supports HEIC, the spec's headline conversion", () => {
    const output = execFileSync(MAGICK, ["-list", "format"], { encoding: "utf8" });
    expect(output).toMatch(/^\s+HEIC\s+rw/m);
  });

  test("converts heic to jpg using only bundled code", () => {
    const heic = "/tmp/converter-im-test.heic";
    const jpg = "/tmp/converter-im-test.jpg";
    execFileSync(MAGICK, ["-size", "32x32", "xc:navy", heic]);
    execFileSync(MAGICK, [heic, jpg]);
    expect(existsSync(jpg)).toBe(true);
  });

  test("nothing in the bundle links homebrew", () => {
    const count = execFileSync(
      "bash",
      [
        "-c",
        `find ${BUNDLE} -type f \\( -perm +111 -o -name '*.dylib' \\) -exec otool -L {} \; 2>/dev/null | grep -c '/opt/homebrew' || true`,
      ],
      { encoding: "utf8" },
    );
    expect(Number(count.trim())).toBe(0);
  });
});
