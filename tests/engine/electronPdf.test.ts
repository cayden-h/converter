import { describe, expect, test } from "vitest";
import { convert, properties, type PdfRenderer } from "../../src/main/engine/converters/electronPdf";
import type { ExecFileFn } from "../../src/main/engine/types";

describe("electronPdf converter", () => {
  test("writes pdf from markdown and html", () => {
    const from = new Set(Object.values(properties.from).flat());
    expect(from.has("markdown")).toBe(true);
    expect(from.has("html")).toBe(true);
    expect(properties.to.documents).toEqual(["pdf"]);
  });

  test("converts markdown to html with pandoc first", async () => {
    const calls: string[] = [];
    const exec: ExecFileFn = (cmd, _args, cb) => {
      calls.push(cmd);
      cb(null, "", "");
    };
    const render: PdfRenderer = async () => Buffer.from("%PDF-1.4 fake");
    await convert("/tmp/in.md", "markdown", "pdf", "/tmp/out.pdf", {}, exec, render, async () => {});
    expect(calls).toEqual(["pandoc"]);
  });

  test("renders html directly without pandoc", async () => {
    const calls: string[] = [];
    const exec: ExecFileFn = (cmd, _args, cb) => {
      calls.push(cmd);
      cb(null, "", "");
    };
    const render: PdfRenderer = async () => Buffer.from("%PDF-1.4 fake");
    await convert("/tmp/in.html", "html", "pdf", "/tmp/out.pdf", {}, exec, render, async () => {});
    expect(calls).toEqual([]);
  });

  test("writes exactly the bytes the renderer produced", async () => {
    let written: Buffer | null = null;
    const exec: ExecFileFn = (_c, _a, cb) => cb(null, "", "");
    const render: PdfRenderer = async () => Buffer.from("%PDF-1.4 real bytes");
    await convert("/tmp/in.html", "html", "pdf", "/tmp/out.pdf", {}, exec, render, async (_p, data) => {
      written = data;
    });
    expect((written as Buffer | null)?.toString()).toBe("%PDF-1.4 real bytes");
  });

  test("surfaces a renderer failure rather than writing a truncated file", async () => {
    let wrote = false;
    const exec: ExecFileFn = (_c, _a, cb) => cb(null, "", "");
    const render: PdfRenderer = async () => {
      throw new Error("chromium blew up");
    };
    await expect(
      convert("/tmp/in.html", "html", "pdf", "/tmp/out.pdf", {}, exec, render, async () => {
        wrote = true;
      }),
    ).rejects.toThrow(/chromium/i);
    expect(wrote, "must not write a file when rendering failed").toBe(false);
  });
});
