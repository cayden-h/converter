# Local File Converter - Plan 4: Documents, Data and Vector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the design spec's format coverage - documents via pandoc, data via dasel, vector both directions - and add the PDF writer, without which "markdown to PDF" is impossible.

**Architecture:** Unchanged. Four more converters lift verbatim from ConvertX; two are ours because upstream has no equivalent.

**Tech Stack:** Electron, TypeScript, React, Tailwind, vitest. Node 24, npm. macOS arm64.

**Branch:** `feat/converters-docs-vector`, stacked on `feat/ui` (PR #3).

---

## What the survey found before this plan was written

**All four liftable converters use the shared `ExecFileFn`.** Unlike ffmpeg, pandoc, potrace, resvg and dasel all take `(cmd, args, callback, options)`, so no adapter is needed. They can be registered directly.

**`dasel` is the only converter that writes its own output.** It captures stdout and calls `fs.writeFile` rather than passing a target path to the tool. That makes the 64MB `maxBuffer` default load-bearing for it in a way it is not for the others - a large YAML-to-JSON conversion would truncate at node's 1MB default.

**potrace cannot read PNG.** Its `from` table is `["pnm", "pbm", "pgm", "bmp"]`, confirmed against the real binary's help output. But the design spec's must-work list includes `png and jpg to svg`.

That gap is real and this plan closes it with a composite converter rather than a general chaining engine - see Task 3.

**vtracer is not installable via Homebrew.** It is a Rust crate needing `cargo install`. It remains detect-only, reported by the Formats panel with the correct hint. `potrace` plus the composite converter covers raster-to-vector without it.

## Verified against the real binaries before writing this plan

Treat these as settled - they were run, not assumed:

- `magick shape.png -monochrome shape.pbm` produces a valid 1210-byte bitmap.
- `potrace -s -o shape.svg shape.pbm` produces a 720-byte SVG containing a real `<path>` element, not an empty wrapper. This is what makes Task 3's two-step approach viable.
- `pandoc -s -o doc.html doc.md` produces a document containing `<html>`.
- Upstream's dasel argument form - `--var data=<type>:file:<path> --out <type> $data` - works with the installed dasel 3.11.2 and emits valid JSON. Worth noting because dasel's CLI changed between major versions and the older `-f/-r/-w` form fails outright on this machine.

---

### Task 1: Lift pandoc, resvg and dasel

Three straightforward lifts. All use the shared `ExecFileFn`; all need the same single import-path edit as `imagemagick.ts`.

**Files:**
- Create: `src/main/engine/converters/pandoc.ts`, `resvg.ts`, `dasel.ts` (copied)
- Modify: `THIRD_PARTY.md`
- Test: `tests/engine/documentConverters.test.ts`

- [ ] **Step 1: Copy and fix the one import each**

```bash
SRC=/private/tmp/claude-501/-Users-cayden-Documents-GitHub-converter/3f1c4534-eb86-4ad2-8e0e-db6f18a5c536/scratchpad/convertx
for f in pandoc resvg dasel; do
  cp "$SRC/src/converters/$f.ts" "src/main/engine/converters/$f.ts"
  sed -i '' 's|from "./types"|from "../types"|' "src/main/engine/converters/$f.ts"
done
```

If that clone is gone: `git clone --depth 1 https://github.com/C4illin/ConvertX.git /tmp/convertx-ref` and use that path.

Prove each is byte-identical apart from the import:

```bash
for f in pandoc resvg dasel; do
  diff <(sed 's|from "./types"|from "../types"|' "$SRC/src/converters/$f.ts") "src/main/engine/converters/$f.ts" \
    && echo "$f VERBATIM"
done
```

Paste that output. Any difference means something went wrong - stop and report.

- [ ] **Step 2: Record attribution**

Add to the file list in `THIRD_PARTY.md`:

```markdown
- `src/main/engine/converters/pandoc.ts` from `src/converters/pandoc.ts`
- `src/main/engine/converters/resvg.ts` from `src/converters/resvg.ts`
- `src/main/engine/converters/dasel.ts` from `src/converters/dasel.ts`
```

- [ ] **Step 3: Write characterization tests**

`tests/engine/documentConverters.test.ts`:

```ts
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
```

- [ ] **Step 4: Run**

Run: `npx vitest run tests/engine/documentConverters.test.ts`
Expected: PASS, 5 tests. These characterize copied code and should pass immediately. If one fails, align the TEST with what upstream emits; never edit a copied file.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/converters/pandoc.ts src/main/engine/converters/resvg.ts src/main/engine/converters/dasel.ts THIRD_PARTY.md tests/engine/documentConverters.test.ts
git commit -m "feat: lift the pandoc, resvg and dasel converters"
```

---

### Task 2: Lift potrace

Separate from Task 1 because its format table needs a comment recording a real limitation.

**Files:**
- Create: `src/main/engine/converters/potrace.ts` (copied)
- Modify: `THIRD_PARTY.md`
- Test: `tests/engine/potrace.test.ts`

- [ ] **Step 1: Copy, fix the import, prove fidelity**

Same procedure as Task 1. Paste the diff output.

- [ ] **Step 2: Write the test**

`tests/engine/potrace.test.ts`:

```ts
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
```

- [ ] **Step 3: Run and commit**

```bash
git add src/main/engine/converters/potrace.ts THIRD_PARTY.md tests/engine/potrace.test.ts
git commit -m "feat: lift the potrace converter"
```

---

### Task 3: A composite converter for raster to vector

The spec's must-work list includes `png and jpg to svg`. potrace cannot read either. vtracer could, but is not installable via Homebrew.

The fix is a converter that rasterises to a bitmap with ImageMagick, then traces with potrace, owning its intermediate file. This is NOT a general chaining engine - that would be a plan of its own. It is one converter that happens to invoke two tools.

**Files:**
- Create: `src/main/engine/converters/rasterTrace.ts`
- Test: `tests/engine/rasterTrace.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/rasterTrace.test.ts`:

```ts
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
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/engine/rasterTrace.test.ts`
Expected: FAIL, module not found. Report the output.

- [ ] **Step 3: Implement**

`src/main/engine/converters/rasterTrace.ts`:

```ts
import { execFile as execFileOriginal } from "node:child_process";
import { unlink } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExecFileFn } from "../types";

/**
 * Raster to vector, in two steps.
 *
 * The spec requires png and jpg to svg, but potrace reads only pnm/pbm/pgm/bmp
 * - verified against the real binary - and vtracer, which reads raster
 * directly, is a Rust crate not installable via Homebrew.
 *
 * So this converter rasterises with ImageMagick and traces with potrace. It is
 * deliberately NOT a general chaining engine; it is one converter that happens
 * to invoke two tools, and it owns its intermediate file's cleanup.
 */
export const properties = {
  from: {
    images: ["png", "jpeg", "jpg", "gif", "bmp", "tiff", "webp"],
  },
  to: {
    images: ["svg"],
  },
};

export function convert(
  filePath: string,
  _fileType: string,
  _convertTo: string,
  targetPath: string,
  _options?: unknown,
  execFile: ExecFileFn = execFileOriginal as ExecFileFn,
  removeFile: (p: string) => void = (p) => unlink(p, () => {}),
): Promise<string> {
  const intermediate = path.join(
    tmpdir(),
    `converter-trace-${Date.now()}-${path.basename(targetPath, ".svg")}.pbm`,
  );

  return new Promise((resolve, reject) => {
    // potrace wants a bitmap. -monochrome gives it clean black and white
    // rather than a dithered greyscale that traces into noise.
    execFile("magick", [filePath, "-monochrome", intermediate], (rasterError) => {
      if (rasterError) {
        removeFile(intermediate);
        reject(new Error(`rasterise step failed: ${rasterError.message}`));
        return;
      }

      execFile("potrace", ["-s", "-o", targetPath, intermediate], (traceError) => {
        removeFile(intermediate);
        if (traceError) {
          reject(new Error(`trace step failed: ${traceError.message}`));
          return;
        }
        resolve("Done");
      });
    });
  });
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx vitest run tests/engine/rasterTrace.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/converters/rasterTrace.ts tests/engine/rasterTrace.test.ts
git commit -m "feat: add a composite raster-to-vector converter"
```

---

### Task 4: The PDF writer

pandoc has no PDF engine of its own; it delegates to LaTeX, which is far too large to ship. Electron already contains Chromium, so it is the PDF engine.

**Files:**
- Create: `src/main/engine/converters/electronPdf.ts`
- Test: `tests/engine/electronPdf.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/electronPdf.test.ts`:

```ts
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
    expect(written?.toString()).toBe("%PDF-1.4 real bytes");
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
```

- [ ] **Step 2: Run and confirm failure**

Report the output.

- [ ] **Step 3: Implement**

`src/main/engine/converters/electronPdf.ts`:

```ts
import { execFile as execFileOriginal } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExecFileFn } from "../types";

/**
 * Markdown and HTML to PDF, using Electron's own Chromium.
 *
 * pandoc has no PDF engine; it delegates to LaTeX, which is a multi-gigabyte
 * dependency this app will not ship. Electron already contains a browser that
 * renders PDFs well, so it is the engine.
 *
 * The renderer is injected so this module is testable without launching a
 * BrowserWindow - the real one lives in src/main/pdf.ts.
 */
export type PdfRenderer = (htmlPath: string) => Promise<Buffer>;
export type FileWriter = (targetPath: string, data: Buffer) => Promise<void>;

export const properties = {
  from: {
    documents: ["markdown", "md", "html", "htm"],
  },
  to: {
    documents: ["pdf"],
  },
};

export async function convert(
  filePath: string,
  fileType: string,
  _convertTo: string,
  targetPath: string,
  _options?: unknown,
  execFile: ExecFileFn = execFileOriginal as ExecFileFn,
  render?: PdfRenderer,
  write: FileWriter = (target, data) => writeFile(target, data),
): Promise<string> {
  if (!render) throw new Error("electronPdf: no renderer supplied");

  let htmlPath = filePath;

  if (fileType === "markdown" || fileType === "md") {
    htmlPath = path.join(tmpdir(), `converter-md-${Date.now()}.html`);
    await new Promise<void>((resolve, reject) => {
      execFile("pandoc", ["-s", "-o", htmlPath, filePath], (error) => {
        if (error) reject(new Error(`markdown to html failed: ${error.message}`));
        else resolve();
      });
    });
  }

  // Let a render failure propagate before anything is written: a partial PDF
  // on disk would be reported as a success by the job runner's existence check.
  const pdf = await render(htmlPath);
  await write(targetPath, pdf);
  return "Done";
}
```

- [ ] **Step 4: Implement the real renderer**

`src/main/pdf.ts`:

```ts
import { BrowserWindow } from "electron";
import { pathToFileURL } from "node:url";

/**
 * Renders a local HTML file to PDF in an offscreen window.
 *
 * The offscreen window is covered by the same offline guard as the main one,
 * so a document referencing a remote stylesheet or image renders without it
 * rather than reaching the network.
 */
export async function renderPdf(htmlPath: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false },
  });
  try {
    await window.loadURL(pathToFileURL(htmlPath).toString());
    return await window.webContents.printToPDF({ printBackground: true });
  } finally {
    window.destroy();
  }
}
```

Note `javascript: false`: a converted document has no reason to execute script, and disabling it removes a whole class of risk from opening an untrusted HTML file.

- [ ] **Step 5: Confirm and commit**

```bash
git add src/main/engine/converters/electronPdf.ts src/main/pdf.ts tests/engine/electronPdf.test.ts
git commit -m "feat: add a PDF writer using electron's own chromium"
```

---

### Task 4b: Teach the toolchain about the new tools, and let a converter need more than one

Task 5 was attempted and correctly reported BLOCKED. Two gaps, both mine:

**1. `ToolName` does not include the new tools.** It is `"imagemagick" | "ffmpeg" | "ffprobe" | "poppler" | "pandoc"`. `resvg`, `dasel` and `potrace` are absent, and `toCommandMap` builds the `CommandMap` the runner uses solely from `KNOWN_TOOLS` keys.

Registering those three with a borrowed `tool` value would let `buildRegistry` treat them as available and advertise `svg -> png`, `png -> svg` and `csv -> json` in the picker - and every one would fail at runtime with `Tool not available: resvg`, because `createExecFile` does a hard map lookup with no PATH fallback. A format offered that cannot work is worse than one absent.

**2. A converter can need more than one tool.** `rasterTrace` invokes ImageMagick AND potrace. `ConverterEntry.tool` holds a single name, so declaring either one alone would offer the conversion when the other is missing. Make the dependency plural and honest.

**Files:**
- Modify: `src/main/engine/toolchain.ts`
- Modify: `src/main/engine/registry.ts`
- Modify: `src/main/engine/index.ts`
- Modify: `tests/engine/toolchain.test.ts`, `tests/engine/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/engine/registry.test.ts`:

```ts
  test("a converter needing two tools is offered only when both resolve", () => {
    // rasterTrace shells out to magick AND potrace. Declaring one dependency
    // would advertise png -> svg while the other tool is missing, and the
    // conversion would fail at runtime with "Tool not available".
    const composite = {
      tools: ["imagemagick", "potrace"] as const,
      priority: 25,
      properties: { from: { images: ["png"] }, to: { images: ["svg"] } },
      convert: async () => "Done",
    };
    const both = buildRegistry(
      { rasterTrace: composite },
      { imagemagick: "/bin/magick", potrace: "/bin/potrace" },
    );
    expect(both.converterFor("png", "svg")?.name).toBe("rasterTrace");

    const onlyOne = buildRegistry({ rasterTrace: composite }, { imagemagick: "/bin/magick" });
    expect(onlyOne.converterFor("png", "svg"), "must not offer with potrace missing").toBeNull();
    expect(onlyOne.missingTools()).toContain("potrace");
  });
```

Add to `tests/engine/toolchain.test.ts`:

```ts
  test("resolves the tools added for documents, data and vector", () => {
    for (const [name, binary] of [
      ["resvg", "resvg"],
      ["dasel", "dasel"],
      ["potrace", "potrace"],
    ] as const) {
      const result = resolveTool(name, {
        platform: "darwin",
        arch: "arm64",
        bundleDir: "/nonexistent",
        exists: (p) => p === `/opt/homebrew/bin/${binary}`,
      });
      expect(result, `${name} should resolve`).toBe(`/opt/homebrew/bin/${binary}`);
    }
  });

  test("toCommandMap emits the new tools so converters can call them", () => {
    // resvg.ts calls execFile("resvg", ...) by bare name. Without a CommandMap
    // entry the lookup misses and every conversion reports the tool missing.
    const commands = toCommandMap({
      resvg: "/opt/homebrew/bin/resvg",
      dasel: "/opt/homebrew/bin/dasel",
      potrace: "/opt/homebrew/bin/potrace",
    });
    expect(commands.resvg).toBe("/opt/homebrew/bin/resvg");
    expect(commands.dasel).toBe("/opt/homebrew/bin/dasel");
    expect(commands.potrace).toBe("/opt/homebrew/bin/potrace");
  });
```

Import `toCommandMap` from `../../src/main/engine/exec` in the toolchain test.

- [ ] **Step 2: Run and confirm failure**

Report both failures.

- [ ] **Step 3: Extend `ToolName` and `KNOWN_TOOLS`**

Add `"resvg" | "dasel" | "potrace"` to `ToolName`, and three entries to `KNOWN_TOOLS` following the existing shape. Verified present on this machine at `/opt/homebrew/bin/{resvg,dasel,potrace}`.

```ts
  resvg: {
    binary: "resvg",
    binaries: ["resvg"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/resvg", "/usr/local/bin/resvg"],
      win32: ["C:\\Program Files\\resvg\\resvg.exe"],
    },
  },
  dasel: {
    binary: "dasel",
    binaries: ["dasel"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/dasel", "/usr/local/bin/dasel"],
      win32: ["C:\\Program Files\\dasel\\dasel.exe"],
    },
  },
  potrace: {
    binary: "potrace",
    binaries: ["potrace"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/potrace", "/usr/local/bin/potrace"],
      win32: ["C:\\Program Files\\potrace\\potrace.exe"],
    },
  },
```

- [ ] **Step 4: Make the dependency plural**

In `src/main/engine/registry.ts`, replace `tool: ToolName` on `ConverterEntry` with:

```ts
  /**
   * Every tool this converter shells out to. Plural because rasterTrace needs
   * ImageMagick AND potrace - declaring one would offer the conversion while
   * the other is missing, and it would fail at runtime with a bare
   * "Tool not available".
   */
  tools: readonly ToolName[];
```

In `buildRegistry`, a converter is available only when ALL its tools resolved, and every unresolved one is reported missing:

```ts
  for (const [name, entry] of Object.entries(converters)) {
    const missingForEntry = entry.tools.filter((tool) => !toolchain[tool]);
    if (missingForEntry.length === 0) {
      available.push({ ...entry, name });
    } else {
      for (const tool of missingForEntry) missing.add(tool);
    }
  }
```

Update every existing entry in `index.ts` and every fixture in the tests from `tool: "x"` to `tools: ["x"]`.

- [ ] **Step 5: Confirm and commit**

`npm test`, `npx tsc -b tsconfig.node.json tsconfig.web.json; echo "exit=$?"`.

```bash
git add src/main/engine/toolchain.ts src/main/engine/registry.ts src/main/engine/index.ts tests/engine/toolchain.test.ts tests/engine/registry.test.ts
git commit -m "feat: register the new tools and let a converter depend on several"
```

---

### Task 5: Register everything

**Files:**
- Modify: `src/main/engine/index.ts`
- Modify: `tests/engine/routing.test.ts`

- [ ] **Step 1: Add the routing tests first**

Add to the `test.each` table in `tests/engine/routing.test.ts`:

```ts
    ["md", "html", "pandoc"],
    ["md", "pdf", "electronPdf"],
    ["html", "pdf", "electronPdf"],
    ["svg", "png", "resvg"],
    ["png", "svg", "rasterTrace"],
    ["csv", "json", "dasel"],
    ["json", "yaml", "dasel"],
    ["epub", "html", "pandoc"],
```

- [ ] **Step 2: Run and confirm failure**

Report which pairs fail and what they currently route to. Some may already route somewhere wrong rather than nowhere - that is informative.

- [ ] **Step 3: Register with deliberate priorities**

Add each converter to `CONVERTERS`. Priorities, highest first, with reasoning:

- `electronPdf: 40`, `tools: ["pandoc"]`, for markdown and html input. It must beat pandoc, which also claims `md -> pdf` but would need a LaTeX engine we do not ship and would fail at runtime.
- `poppler: 30` (unchanged) for pdf input.
- `rasterTrace: 25`, `tools: ["imagemagick", "potrace"]`, for raster input to svg. Beats ImageMagick, which claims svg output but produces an embedded-bitmap svg rather than real vector paths.
- `ffmpeg`: unchanged input-aware function.
- `resvg: 15`, `tools: ["resvg"]`, for svg input. Beats ImageMagick for svg rasterisation, which is what resvg exists for.
- `imagemagick: 10` (unchanged).
- `pandoc: 10`, `tools: ["pandoc"]`, for documents.
- `potrace: 10`, `tools: ["potrace"]`, for bitmap input.
- `dasel: 10`, `tools: ["dasel"]`, for data.

`electronPdf` needs the injected renderer wired at registration:

```ts
  electronPdf: {
    tool: "pandoc",
    priority: 40,
    properties: propertiesElectronPdf,
    convert: (filePath, fileType, convertTo, targetPath, options, execFileOverride) =>
      convertElectronPdf(filePath, fileType, convertTo, targetPath, options, execFileOverride, renderPdf),
  },
```

Note it declares `tool: "pandoc"` because markdown input genuinely needs pandoc; HTML input does not, but declaring the stricter dependency is honest - the converter is only offered when the tool it may need is present.

- [ ] **Step 4: Confirm and commit**

```bash
git add src/main/engine/index.ts tests/engine/routing.test.ts
git commit -m "feat: register the document, data and vector converters"
```

---

### Task 6: Real integration tests

Every test above uses a mock. This project has twice found bugs that only real binaries expose.

**Files:**
- Modify: `tests/fixtures/make-fixtures.ts`
- Modify: `tests/integration/convert.test.ts`

- [ ] **Step 1: Add fixtures**

Generators for a markdown file, an HTML file, an SVG, and a CSV. All are plain text - write them with `writeFileSync`, no tool needed.

- [ ] **Step 2: Add the tests**

Guarded by the relevant tool being present:

- `md -> html` via pandoc, asserting the output contains `<html`
- `md -> pdf`, asserting the output starts with `%PDF`
- `html -> pdf`, asserting `%PDF`
- `svg -> png` via resvg, asserting the PNG magic bytes `89 50 4E 47`
- `png -> svg` via rasterTrace, asserting the output contains `<svg` AND a `<path` element - a wrapper svg with no paths would mean tracing silently produced nothing
- `csv -> json` via dasel, asserting the output parses as JSON with the expected keys

**The `md -> pdf` and `html -> pdf` tests may not be runnable under vitest**, because `printToPDF` needs a real Electron app context, not a plain node process. If they cannot run, say so clearly and mark them skipped with a comment explaining why - do NOT fake a renderer and claim the path is verified. That would be exactly the kind of test this project has already found five of.

- [ ] **Step 3: Run for real and report**

Run: `npx vitest run tests/integration/convert.test.ts --reporter=verbose`

**Report verbatim, stating which tests actually ran versus skipped.** pandoc, resvg, dasel, potrace and magick are all installed, so everything except possibly the PDF tests should genuinely execute.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/make-fixtures.ts tests/integration/convert.test.ts
git commit -m "test: add real integration coverage for documents, data and vector"
```

---

## Definition of Done

- pandoc, resvg, dasel and potrace lifted byte-identical, with attribution.
- `png -> svg` works despite potrace not reading png, via a composite converter that owns its intermediate file.
- `md -> pdf` and `html -> pdf` work through Electron's Chromium, with no LaTeX dependency.
- Routing verified against the real tables for every new pair.
- Integration tests run against real binaries, and any test that could not run is honestly marked skipped rather than faked.
- `npm test` green, `tsc -b` exit 0, `npm run build` succeeds.

## Open Items

**vtracer stays unavailable.** A Rust crate, not in Homebrew. The Formats panel reports it with a `cargo install` hint. `rasterTrace` covers the requirement without it.

**Carried forward, unchanged:** `openPath`/`reveal` accept unvalidated paths; poppler renders page 1 only; `.wmv` has no ffmpeg fallback and `.ts` cannot be converted; per-converter options and a configurable output folder are deferred.

## Not In This Plan

**Packaging.** Binary vendoring, the dylib closure problem, electron-builder configuration, and signing. A survey found the Homebrew binaries are far from self-contained - ffmpeg alone links 19 Homebrew dylibs by absolute path - so bundling needs either genuinely static builds or a recursive `install_name_tool` relocation pass. That is a plan of its own, and the design spec substantially underestimated it. Signing will be ad-hoc for local use: the available certificate is an Apple Development identity, which cannot notarize.
