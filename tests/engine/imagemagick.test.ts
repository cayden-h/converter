import { describe, expect, test } from "vitest";
import { convert, properties } from "../../src/main/engine/converters/imagemagick";
import { normalizeFiletype } from "../../src/main/engine/normalizeFiletype";
import type { ExecFileFn } from "../../src/main/engine/types";

describe("imagemagick converter", () => {
  test("declares png and jpg among its input formats", () => {
    expect(properties.from.images).toContain("png");
    expect(properties.from.images).toContain("jpg");
  });

  test("invokes magick with input path before output path", async () => {
    let seen: { cmd: string; args: string[] } = { cmd: "", args: [] };
    const mock: ExecFileFn = (cmd, args, cb) => {
      seen = { cmd, args };
      cb(null, "", "");
    };
    await convert("/tmp/in.png", "png", "jpg", "/tmp/out.jpg", {}, mock);
    expect(seen.cmd).toBe("magick");
    expect(seen.args).toContain("/tmp/in.png");
    expect(seen.args[seen.args.length - 1]).toBe("/tmp/out.jpg");
  });

  test("applies auto-orient so phone photos are not sideways", async () => {
    let seenArgs: string[] = [];
    const mock: ExecFileFn = (_cmd, args, cb) => {
      seenArgs = args;
      cb(null, "", "");
    };
    await convert("/tmp/in.heic", "heic", "jpg", "/tmp/out.jpg", {}, mock);
    expect(seenArgs).toContain("-auto-orient");
  });

  test("adds icon resize defines when the target is ico", async () => {
    let seenArgs: string[] = [];
    const mock: ExecFileFn = (_cmd, args, cb) => {
      seenArgs = args;
      cb(null, "", "");
    };
    await convert("/tmp/in.png", "png", "ico", "/tmp/out.ico", {}, mock);
    expect(seenArgs).toContain("icon:auto-resize=256,128,64,48,32,16");
  });
});

describe("normalizeFiletype", () => {
  test("folds jpg onto jpeg", () => {
    expect(normalizeFiletype("jpg")).toBe("jpeg");
    expect(normalizeFiletype("JPG")).toBe("jpeg");
  });

  test("leaves an unknown extension alone but lowercases it", () => {
    expect(normalizeFiletype("PNG")).toBe("png");
  });
});
