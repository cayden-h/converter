import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const BUNDLE = "resources/bin/darwin-arm64";
const MAGICK = `${BUNDLE}/bin/magick`;

describe.skipIf(!existsSync(MAGICK))("bundled ImageMagick", () => {
  test("ships its coder modules", () => {
    // Homebrew builds ImageMagick --with-modules, so every format is a
    // separate .so dlopen'd at runtime. They are invisible to otool -L, which
    // is why the dylib-closure walk missed them entirely.
    expect(existsSync(`${BUNDLE}/lib/ImageMagick/modules-Q16HDRI/coders`)).toBe(true);
  });

  test("ships its XML configuration", () => {
    expect(existsSync(`${BUNDLE}/etc/ImageMagick-7/delegates.xml`)).toBe(true);
  });

  test("actually knows about image formats", () => {
    // The real assertion. A magick that resolves, runs, and reports --version
    // correctly can still know zero formats and convert nothing.
    const output = execFileSync(MAGICK, ["-list", "format"], {
      encoding: "utf8",
      env: {
        ...process.env,
        MAGICK_CODER_MODULE_PATH: `${process.cwd()}/${BUNDLE}/lib/ImageMagick/modules-Q16HDRI/coders`,
        MAGICK_CONFIGURE_PATH: `${process.cwd()}/${BUNDLE}/etc/ImageMagick-7`,
      },
    });
    const formats = output.split("\n").filter((line) => /^ +[A-Z0-9]+/.test(line));
    expect(formats.length, "bundled magick must know some formats").toBeGreaterThan(100);
  });

  test("converts a real file using only bundled coders", () => {
    const env = {
      ...process.env,
      MAGICK_CODER_MODULE_PATH: `${process.cwd()}/${BUNDLE}/lib/ImageMagick/modules-Q16HDRI/coders`,
      MAGICK_CONFIGURE_PATH: `${process.cwd()}/${BUNDLE}/etc/ImageMagick-7`,
    };
    const png = "/tmp/converter-modules-test.png";
    const jpg = "/tmp/converter-modules-test.jpg";
    execFileSync(MAGICK, ["-size", "32x32", "xc:red", png], { env });
    execFileSync(MAGICK, [png, jpg], { env });
    expect(existsSync(jpg)).toBe(true);
  });

  test("no coder module links homebrew", () => {
    // Each coder links libMagickCore. If it links the ORIGINAL, loading it
    // pulls a second copy of that library into the process and the module
    // silently fails to load - which is exactly what broke the first bundle.
    const coders = `${BUNDLE}/lib/ImageMagick/modules-Q16HDRI/coders`;
    const output = execFileSync(
      "bash",
      ["-c", `find ${coders} -name '*.so' -exec otool -L {} \; | grep -c '/opt/homebrew' || true`],
      { encoding: "utf8" },
    );
    expect(Number(output.trim()), "coder modules still link homebrew").toBe(0);
  });
});
