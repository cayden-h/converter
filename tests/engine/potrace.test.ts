import { describe, expect, test } from "vitest";
import { convert, properties } from "../../src/main/engine/converters/potrace";
import type { ExecFileFn } from "../../src/main/engine/types";

describe("potrace converter", () => {
  test("reads only bitmap formats, NOT png or jpg", () => {
    // Verified against the real binary. This is why Task 3's composite
    // converter exists: the spec requires png -> svg, and potrace alone
    // cannot do it.
    expect(properties.from.images).toEqual(["pnm", "pbm", "pgm", "bmp"]);
    expect(properties.from.images).not.toContain("png");
    expect(properties.from.images).not.toContain("jpg");
  });

  test("writes svg among its output formats", () => {
    expect(properties.to.images).toContain("svg");
  });

  test("selects a backend for the target format", async () => {
    let seen: string[] = [];
    const mock: ExecFileFn = (_cmd, args, cb) => {
      seen = args;
      cb(null, "", "");
    };
    await convert("/tmp/in.pbm", "pbm", "svg", "/tmp/out.svg", {}, mock);
    expect(seen).toContain("/tmp/in.pbm");
    expect(seen.join(" ")).toContain("svg");
  });
});
