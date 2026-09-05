import { describe, expect, test } from "vitest";
import { convert, properties } from "../../src/main/engine/converters/rasterTrace";
import type { ExecFileFn } from "../../src/main/engine/types";

describe("rasterTrace converter", () => {
  test("reads the raster formats potrace cannot", () => {
    expect(properties.from.images).toContain("png");
    expect(properties.from.images).toContain("jpeg");
    expect(properties.to.images).toContain("svg");
  });

  test("runs magick first, then potrace", async () => {
    const calls: string[] = [];
    const mock: ExecFileFn = (cmd, _args, cb) => {
      calls.push(cmd);
      cb(null, "", "");
    };
    await convert("/tmp/in.png", "png", "svg", "/tmp/out.svg", {}, mock);
    expect(calls).toEqual(["magick", "potrace"]);
  });

  test("traces the intermediate bitmap, not the original raster", async () => {
    // potrace must be handed the pbm magick produced. Passing it the png
    // would fail at runtime with an unhelpful error from potrace itself.
    const seen: { cmd: string; args: string[] }[] = [];
    const mock: ExecFileFn = (cmd, args, cb) => {
      seen.push({ cmd, args });
      cb(null, "", "");
    };
    await convert("/tmp/in.png", "png", "svg", "/tmp/out.svg", {}, mock);
    const magickArgs = seen[0]!.args;
    const potraceArgs = seen[1]!.args;
    const intermediate = magickArgs[magickArgs.length - 1]!;
    expect(intermediate).toMatch(/\.pbm$/);
    expect(potraceArgs).toContain(intermediate);
    expect(potraceArgs).not.toContain("/tmp/in.png");
  });

  test("fails clearly when the rasterise step fails", async () => {
    const mock: ExecFileFn = (cmd, _args, cb) => {
      if (cmd === "magick") cb(new Error("boom"), "", "");
      else cb(null, "", "");
    };
    await expect(
      convert("/tmp/in.png", "png", "svg", "/tmp/out.svg", {}, mock),
    ).rejects.toThrow(/rasteris|magick/i);
  });

  test("removes the intermediate file even when tracing fails", async () => {
    // A failed conversion must not leave a stray .pbm beside the user's file.
    const removed: string[] = [];
    const mock: ExecFileFn = (cmd, _args, cb) => {
      if (cmd === "potrace") cb(new Error("trace failed"), "", "");
      else cb(null, "", "");
    };
    await expect(
      convert("/tmp/in.png", "png", "svg", "/tmp/out.svg", {}, mock, (p) => removed.push(p)),
    ).rejects.toThrow();
    expect(removed.some((p) => p.endsWith(".pbm"))).toBe(true);
  });
});
