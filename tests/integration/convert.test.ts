import { existsSync, rmSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createEngine } from "../../src/main/engine";
import { ensurePngFixture } from "../fixtures/make-fixtures";

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
});
