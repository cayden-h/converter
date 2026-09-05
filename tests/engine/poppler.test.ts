import { describe, expect, test } from "vitest";
import { convert, properties } from "../../src/main/engine/converters/poppler";
import type { ExecFileFn } from "../../src/main/engine/types";

describe("poppler converter", () => {
  test("reads pdf and writes images and text", () => {
    expect(properties.from.documents).toContain("pdf");
    expect(properties.to.images).toContain("png");
    expect(properties.to.images).toContain("jpeg");
    expect(properties.to.documents).toContain("txt");
  });

  test("uses pdftoppm with a png flag for image output", async () => {
    let seen = { cmd: "", args: [] as string[] };
    const mock: ExecFileFn = (cmd, args, cb) => {
      seen = { cmd, args };
      cb(null, "", "");
    };
    await convert("/tmp/in.pdf", "pdf", "png", "/tmp/out.png", {}, mock);
    expect(seen.cmd).toBe("pdftoppm");
    expect(seen.args).toContain("-png");
    expect(seen.args).toContain("/tmp/in.pdf");
  });

  test("uses pdftotext for text output", async () => {
    let seen = { cmd: "", args: [] as string[] };
    const mock: ExecFileFn = (cmd, args, cb) => {
      seen = { cmd, args };
      cb(null, "", "");
    };
    await convert("/tmp/in.pdf", "pdf", "txt", "/tmp/out.txt", {}, mock);
    expect(seen.cmd).toBe("pdftotext");
    expect(seen.args[seen.args.length - 1]).toBe("/tmp/out.txt");
  });

  test("strips the extension from the image prefix", async () => {
    // pdftoppm treats its last argument as a PREFIX and appends -1.png itself.
    // Passing out.png would produce out.png-1.png.
    let seen: string[] = [];
    const mock: ExecFileFn = (_cmd, args, cb) => {
      seen = args;
      cb(null, "", "");
    };
    await convert("/tmp/in.pdf", "pdf", "png", "/tmp/out.png", {}, mock);
    expect(seen[seen.length - 1]).toBe("/tmp/out");
  });

  test("renders only the first page by default", async () => {
    let seen: string[] = [];
    const mock: ExecFileFn = (_cmd, args, cb) => {
      seen = args;
      cb(null, "", "");
    };
    await convert("/tmp/in.pdf", "pdf", "png", "/tmp/out.png", {}, mock);
    const first = seen.indexOf("-f");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(seen.slice(first, first + 4)).toEqual(["-f", "1", "-l", "1"]);
  });

  test("rejects an unsupported target", async () => {
    const mock: ExecFileFn = (_c, _a, cb) => cb(null, "", "");
    await expect(
      convert("/tmp/in.pdf", "pdf", "docx", "/tmp/out.docx", {}, mock),
    ).rejects.toThrow(/unsupported/i);
  });
});
