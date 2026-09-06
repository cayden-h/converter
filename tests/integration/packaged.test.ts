/**
 * Proves the PACKAGED app can actually convert files using only its own
 * bundled binaries, not just that `detectToolchain` can resolve a path and
 * run `--version`.
 *
 * HONESTY NOTE - read this before trusting a green tick here:
 *
 * This test runs on a machine that HAS Homebrew installed (this development
 * machine). It proves the bundled tools inside `release/mac-arm64/Converter.app`
 * are self-contained and callable: every resolved tool path is asserted to
 * live INSIDE the .app bundle, and real conversions are run and their outputs
 * verified by magic bytes / content, not just "the process exited 0".
 *
 * It does NOT prove the app works on a machine that never had Homebrew
 * installed. PATH, DYLD caches, and other ambient state on this machine could
 * still be masking a missing dependency. The only way to prove that is to
 * copy the built .app to a clean Mac with no Homebrew ever installed and run
 * it there - no such machine was available when this test was written, so
 * that verification has NOT been done. Do not read a pass here as "verified
 * to work without Homebrew" - it is not.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createEngine } from "../../src/main/engine";
import { ensureCsvFixture, ensurePngFixtureWith } from "../fixtures/make-fixtures";

const APP_PATH = path.join(__dirname, "..", "..", "release", "mac-arm64", "Converter.app");
const BUNDLE_BIN = path.join(APP_PATH, "Contents", "Resources", "bin");

const appExists = existsSync(APP_PATH);

// The app must be built first: `npx electron-builder --mac --dir`. That build
// takes minutes, so it is not run as part of this test - if it is missing,
// skip honestly rather than fabricate a pass.
describe.skipIf(!appExists)("packaged app: real conversions from bundled binaries only", () => {
  const engine = createEngine(BUNDLE_BIN);

  const outDir = mkdtempSync(path.join(tmpdir(), "converter-packaged-test-"));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  function freshRunner() {
    const e = createEngine(BUNDLE_BIN);
    e.runner.options = { ...e.runner.options, outputDirFor: () => outDir };
    return e.runner;
  }

  test("every resolved tool path lives inside the app bundle", () => {
    const resolved = Object.entries(engine.toolchain);
    // The whole point of this task: a tool resolving to /opt/homebrew here
    // would mean the packaged app depends on Homebrew being installed on the
    // machine that runs it, which the bundling work is supposed to prevent.
    expect(resolved.length).toBeGreaterThan(0);
    for (const [tool, resolvedPath] of resolved) {
      expect(resolvedPath!.startsWith(APP_PATH), `${tool} resolved to ${resolvedPath}, outside the app bundle`).toBe(
        true,
      );
    }
  });

  const magick = engine.toolchain.imagemagick;

  describe.skipIf(!magick)("imagemagick conversions", () => {
    test("converts png to jpg and writes a valid JPEG", async () => {
      // Fixture generated with the BUNDLED magick, not Homebrew's (under a
      // distinct filename from tests/integration/convert.test.ts's fixture,
      // which is generated with whatever magick that test resolves), so this
      // test does not quietly depend on Homebrew to set itself up.
      const input = ensurePngFixtureWith(magick!, "sample-packaged.png");
      const runner = freshRunner();
      const results = await runner.run([{ path: input, output: "jpg" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      const output = results[0]!.outputPath!;
      expect(existsSync(output)).toBe(true);
      const header = readFileSync(output).subarray(0, 3);
      expect([...header]).toEqual([0xff, 0xd8, 0xff]);
    });
  });

  describe.skipIf(!magick || !engine.toolchain.potrace)("rasterTrace conversions", () => {
    test("converts png to svg and traces real vector paths", async () => {
      // Assert both the wrapper AND a real <path>: potrace can emit a valid
      // but EMPTY svg (just the <svg> wrapper, no paths) on a bad threshold,
      // which the wrapper check alone would not catch.
      const input = ensurePngFixtureWith(magick!, "sample-packaged.png");
      const runner = freshRunner();
      const results = await runner.run([{ path: input, output: "svg" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      const output = readFileSync(results[0]!.outputPath!, "utf8");
      expect(output).toContain("<svg");
      expect(output).toContain("<path");
    });
  });

  describe.skipIf(!engine.toolchain.dasel)("dasel conversions", () => {
    test("converts csv to json and writes valid json with the expected keys", async () => {
      const input = ensureCsvFixture();
      const runner = freshRunner();
      const results = await runner.run([{ path: input, output: "json" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      const parsed = JSON.parse(readFileSync(results[0]!.outputPath!, "utf8"));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toMatchObject({ name: "Ada", age: "30" });
    });
  });
});
