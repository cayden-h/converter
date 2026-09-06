import { existsSync, rmSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createEngine } from "../../src/main/engine";
import {
  ensurePngFixture,
  ensureVideoFixture,
  ensurePdfFixture,
  ensureHeicFixture,
  ensureMarkdownFixture,
  ensureHtmlFixture,
  ensureSvgFixture,
  ensureCsvFixture,
} from "../fixtures/make-fixtures";

const engine = createEngine("/nonexistent-bundle-dir");
const magick = engine.toolchain.imagemagick;

const outDir = mkdtempSync(path.join(tmpdir(), "converter-test-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe.skipIf(!magick)("real conversion", () => {
  test("converts png to jpg and writes a valid JPEG", async () => {
    const input = ensurePngFixture(magick!);
    const engineForTest = createEngine("/nonexistent-bundle-dir");
    engineForTest.runner.options = {
      ...engineForTest.runner.options,
      outputDirFor: () => outDir,
    };

    const results = await engineForTest.runner.run([{ path: input, output: "jpg" }]);

    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const output = results[0]!.outputPath!;
    expect(existsSync(output)).toBe(true);

    // JPEG files start with the SOI marker FF D8 FF.
    const header = readFileSync(output).subarray(0, 3);
    expect([...header]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("reports a clear error for an unroutable pair", async () => {
    // Not mp4: ImageMagick genuinely writes mp4 from image sequences, so that
    // pair really does route and this test passed a real conversion instead of
    // the error path. docx is reachable from nothing ImageMagick offers.
    const input = ensurePngFixture(magick!);
    const results = await engine.runner.run([{ path: input, output: "docx" }]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toContain("No converter");
  });

  test("converts heic to jpg, the spec's headline conversion", async () => {
    const input = ensureHeicFixture(magick!);
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "jpg" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const header = readFileSync(results[0]!.outputPath!).subarray(0, 3);
    expect([...header]).toEqual([0xff, 0xd8, 0xff]);
  });
});

describe.skipIf(!engine.toolchain.ffmpeg)("real ffmpeg conversion", () => {
  test("converts mp4 to gif and writes a valid GIF", async () => {
    const input = ensureVideoFixture(engine.toolchain.ffmpeg!);
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "gif" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const header = readFileSync(results[0]!.outputPath!).subarray(0, 3);
    expect(Buffer.from(header).toString()).toBe("GIF");
  });

  test("converts mp4 to mp3 and writes real audio", async () => {
    const input = ensureVideoFixture(engine.toolchain.ffmpeg!);
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "mp3" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    // An MP3 starts with either an ID3 tag or an MPEG frame sync (0xFF 0xEx/0xFx).
    const header = readFileSync(results[0]!.outputPath!).subarray(0, 3);
    const isId3 = header.toString("latin1", 0, 3) === "ID3";
    const isFrameSync = header[0] === 0xff && (header[1]! & 0xe0) === 0xe0;
    expect(isId3 || isFrameSync, `unexpected header: ${[...header]}`).toBe(true);
  });
});

describe.skipIf(!engine.toolchain.poppler || !engine.toolchain.imagemagick)(
  "real poppler conversion",
  () => {
    test("converts pdf to png and writes a valid PNG", async () => {
      const input = ensurePdfFixture(engine.toolchain.imagemagick!);
      const runner = createEngine("/nonexistent-bundle-dir").runner;
      runner.options = { ...runner.options, outputDirFor: () => outDir };
      const results = await runner.run([{ path: input, output: "png" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      const header = readFileSync(results[0]!.outputPath!).subarray(0, 4);
      expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    test("extracts text from a pdf", async () => {
      const input = ensurePdfFixture(engine.toolchain.imagemagick!);
      const runner = createEngine("/nonexistent-bundle-dir").runner;
      runner.options = { ...runner.options, outputDirFor: () => outDir };
      const results = await runner.run([{ path: input, output: "txt" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      expect(existsSync(results[0]!.outputPath!)).toBe(true);
    });
  },
);

describe.skipIf(!engine.toolchain.pandoc)("real pandoc conversion", () => {
  test("converts markdown to html and writes real html", async () => {
    const input = ensureMarkdownFixture();
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "html" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const output = readFileSync(results[0]!.outputPath!, "utf8");
    // pandoc.ts's real invocation does not pass `-s`, so pandoc emits an HTML
    // FRAGMENT, not a standalone document with an <html> wrapper - asserting
    // "<html" here would be asserting a document shape this converter never
    // produces. Assert what it genuinely writes instead: the markdown's
    // structure and formatting, actually converted.
    expect(output).toContain("<h1");
    expect(output).toContain("<strong>bold</strong>");
  });
});

/**
 * md -> pdf and html -> pdf both route through electronPdf, whose renderer
 * calls electron's BrowserWindow.webContents.printToPDF. That API only exists
 * inside a real Electron app process (after `app.whenReady()`), not under
 * plain node/vitest - requiring "electron" outside the Electron binary
 * resolves to a path STRING, not the module, so `BrowserWindow` is undefined
 * here. Faking a renderer would prove nothing about whether real PDF
 * generation works, so these are skipped rather than given a fake that would
 * "pass" regardless of whether the real path is broken.
 */
describe.skip("real electronPdf conversion (requires a live Electron app context)", () => {
  test("converts markdown to pdf and writes a real PDF", async () => {
    const input = ensureMarkdownFixture();
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "pdf" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const header = readFileSync(results[0]!.outputPath!).subarray(0, 4);
    expect(Buffer.from(header).toString()).toBe("%PDF");
  });

  test("converts html to pdf and writes a real PDF", async () => {
    const input = ensureHtmlFixture();
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "pdf" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const header = readFileSync(results[0]!.outputPath!).subarray(0, 4);
    expect(Buffer.from(header).toString()).toBe("%PDF");
  });
});

describe.skipIf(!engine.toolchain.resvg)("real resvg conversion", () => {
  test("converts svg to png and writes a valid PNG", async () => {
    const input = ensureSvgFixture();
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "png" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const header = readFileSync(results[0]!.outputPath!).subarray(0, 4);
    expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

describe.skipIf(!engine.toolchain.imagemagick || !engine.toolchain.potrace)(
  "real rasterTrace conversion",
  () => {
    test("converts png to svg and traces real vector paths", async () => {
      // Assert both the wrapper AND a <path>: potrace on a badly-thresholded
      // bitmap can emit a valid but EMPTY svg (just the <svg> wrapper, no
      // paths), which would be a silent no-op that a wrapper-only assertion
      // would miss entirely.
      const input = ensurePngFixture(engine.toolchain.imagemagick!);
      const runner = createEngine("/nonexistent-bundle-dir").runner;
      runner.options = { ...runner.options, outputDirFor: () => outDir };
      const results = await runner.run([{ path: input, output: "svg" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      const output = readFileSync(results[0]!.outputPath!, "utf8");
      expect(output).toContain("<svg");
      expect(output).toContain("<path");
    });
  },
);

describe.skipIf(!engine.toolchain.dasel)("real dasel conversion", () => {
  test("converts csv to json and writes valid json with the expected keys", async () => {
    const input = ensureCsvFixture();
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "json" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const parsed = JSON.parse(readFileSync(results[0]!.outputPath!, "utf8"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ name: "Ada", age: "30" });
  });
});
