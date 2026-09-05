import { describe, expect, test } from "vitest";
import { convert, properties } from "../../src/main/engine/converters/ffmpeg";

type FfmpegMock = (
  cmd: string,
  args: string[],
  options: object,
  callback: (err: Error | null, stdout: string, stderr: string) => void,
) => void;

describe("ffmpeg converter", () => {
  test("declares common video and audio formats", () => {
    const from = new Set(Object.values(properties.from).flat());
    const to = new Set(Object.values(properties.to).flat());
    for (const format of ["mp4", "mov", "mkv", "webm"]) {
      expect(from.has(format), `should read ${format}`).toBe(true);
    }
    for (const format of ["mp3", "wav", "flac", "gif"]) {
      expect(to.has(format), `should write ${format}`).toBe(true);
    }
  });

  test("puts the input after -i and the target last", async () => {
    let seen: string[] = [];
    const mock: FfmpegMock = (_c, args, _o, cb) => {
      seen = args;
      cb(null, "", "");
    };
    await convert("/tmp/in.mov", "mov", "mp4", "/tmp/out.mp4", {}, mock as never);
    const inputIndex = seen.indexOf("-i");
    expect(inputIndex).toBeGreaterThanOrEqual(0);
    expect(seen[inputIndex + 1]).toBe("/tmp/in.mov");
    expect(seen[seen.length - 1]).toBe("/tmp/out.mp4");
  });

  test("selects a codec from a compound target", async () => {
    let seen: string[] = [];
    const mock: FfmpegMock = (_c, args, _o, cb) => {
      seen = args;
      cb(null, "", "");
    };
    await convert("/tmp/in.mov", "mov", "av1.mp4", "/tmp/out.mp4", {}, mock as never);
    expect(seen).toContain("libaom-av1");
  });

  test("raises maxBuffer well above node's default", async () => {
    // ffmpeg streams progress to stderr; the 1MB default truncates long runs.
    let seenOptions: { maxBuffer?: number } = {};
    const mock: FfmpegMock = (_c, _a, options, cb) => {
      seenOptions = options as { maxBuffer?: number };
      cb(null, "", "");
    };
    await convert("/tmp/in.mov", "mov", "mp4", "/tmp/out.mp4", {}, mock as never);
    expect(seenOptions.maxBuffer ?? 0).toBeGreaterThan(1024 * 1024);
  });
});
