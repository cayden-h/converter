import { describe, expect, test } from "vitest";
import { convert as convertPandoc, properties as pandocProps } from "../../src/main/engine/converters/pandoc";
import { convert as convertResvg, properties as resvgProps } from "../../src/main/engine/converters/resvg";
import { properties as daselProps } from "../../src/main/engine/converters/dasel";
import type { ExecFileFn } from "../../src/main/engine/types";

describe("pandoc converter", () => {
  test("declares the document formats the spec needs", () => {
    const from = new Set(Object.values(pandocProps.from).flat());
    const to = new Set(Object.values(pandocProps.to).flat());
    for (const f of ["markdown", "html", "docx", "epub"]) {
      expect(from.has(f), `should read ${f}`).toBe(true);
    }
    for (const f of ["html", "epub", "rtf"]) {
      expect(to.has(f), `should write ${f}`).toBe(true);
    }
  });

  test("passes input and output paths to pandoc", async () => {
    let seen: string[] = [];
    const mock: ExecFileFn = (_cmd, args, cb) => {
      seen = args;
      cb(null, "", "");
    };
    await convertPandoc("/tmp/in.md", "markdown", "html", "/tmp/out.html", {}, mock);
    expect(seen).toContain("/tmp/in.md");
    expect(seen.join(" ")).toContain("/tmp/out.html");
  });
});

describe("resvg converter", () => {
  test("reads svg and writes png only", () => {
    expect(resvgProps.from.images).toEqual(["svg"]);
    expect(resvgProps.to.images).toEqual(["png"]);
  });

  test("passes both paths", async () => {
    let seen: string[] = [];
    const mock: ExecFileFn = (_cmd, args, cb) => {
      seen = args;
      cb(null, "", "");
    };
    await convertResvg("/tmp/in.svg", "svg", "png", "/tmp/out.png", {}, mock);
    expect(seen).toContain("/tmp/in.svg");
    expect(seen).toContain("/tmp/out.png");
  });
});

describe("dasel converter", () => {
  test("declares the data formats the spec needs", () => {
    const from = new Set(Object.values(daselProps.from).flat());
    const to = new Set(Object.values(daselProps.to).flat());
    for (const f of ["json", "yaml", "csv", "xml", "toml"]) {
      expect(from.has(f) || to.has(f), `should handle ${f}`).toBe(true);
    }
  });
});
