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
