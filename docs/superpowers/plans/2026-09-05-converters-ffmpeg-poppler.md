# Local File Converter - Plan 2: Video, Audio, and PDF Input

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add video and audio conversion via ffmpeg, and PDF input via poppler, after first making the engine correct for more than one converter.

**Architecture:** Unchanged from Plan 1. Converters remain lifted verbatim from ConvertX where one exists; poppler has no upstream equivalent, so that module is ours. The engine gains an explicit converter-priority policy, correct handling of compound output formats, and a toolchain entry shape that fits multi-binary tool suites.

**Tech Stack:** Electron, TypeScript, electron-vite, React, vitest. Node 24, npm. macOS arm64.

**Branch:** `feat/converters-ffmpeg-poppler`, stacked on `feat/foundation-engine-core` (PR #1).

---

## Why the first four tasks come before any converter

Plan 1 shipped with one converter, which hid three problems. Measured against the real format tables:

- ImageMagick and ffmpeg overlap on **43 input formats and 45 output formats** (`gif`, `ico`, `bmp`, `avif`, `flv`, and more). `converterFor` currently returns the first match in `Object.entries()` order, so adding ffmpeg silently decides 45 routes by declaration order.
- ffmpeg advertises **7 compound outputs** (`av1.mp4`, `h264.mkv`, `h265.mp4`, `h266.mkv`, …). The job runner names output files from the whole string, so it would write `clip.av1.mp4` instead of `clip.mp4`.
- ffmpeg's `convert()` takes a **different exec signature** from every other converter: `(cmd, args, options, callback)`, node's real order, rather than the shared `ExecFileFn`'s `(cmd, args, callback, options)`. Upstream's own comment explains why - they hit the same argument-order trap Plan 1 found as defect 8, and raised `maxBuffer` to 64MB for ffmpeg's stderr progress stream, the same value Plan 1 landed on independently.

Adding ffmpeg before fixing these would produce silent misrouting and wrong filenames.

**One Open Item is now downgraded.** Plan 1 recorded a hazard that lifted converters might dereference `execFile`'s return value, citing ffmpeg streaming. A grep of upstream `ffmpeg.ts` for `spawn`, `stdout.on`, `stderr.on` and `.kill` finds nothing - it uses a plain buffered `execFile`. The hazard is not live for this plan. Leave the Open Item recorded; do not build a `ChildProcess` stub for it here.

---

### Task 1: Explicit converter priority

**Files:**
- Modify: `src/main/engine/registry.ts`
- Modify: `tests/engine/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/engine/registry.test.ts`, before the closing `});` of the `buildRegistry` describe block:

```ts
  test("prefers the higher-priority converter when both claim a pair", () => {
    // ImageMagick and ffmpeg overlap on 45 output formats. Without an explicit
    // policy this is decided by Object.entries() order, which is invisible and
    // silently reorderable by anyone editing the converters record.
    const stills = {
      tool: "imagemagick" as const,
      priority: 10,
      properties: { from: { images: ["gif"] }, to: { images: ["png"] } },
      convert: async () => "stills",
    };
    const motion = {
      tool: "ffmpeg" as const,
      priority: 20,
      properties: { from: { video: ["gif"] }, to: { video: ["png"] } },
      convert: async () => "motion",
    };
    const registry = buildRegistry(
      { imagemagick: stills, ffmpeg: motion },
      { imagemagick: "/bin/magick", ffmpeg: "/bin/ffmpeg" },
    );
    expect(registry.converterFor("gif", "png")?.name).toBe("ffmpeg");
  });

  test("priority beats declaration order in both directions", () => {
    // Same two converters, reversed in the record. If the result changed, the
    // policy would still secretly be insertion order.
    const stills = {
      tool: "imagemagick" as const,
      priority: 10,
      properties: { from: { images: ["gif"] }, to: { images: ["png"] } },
      convert: async () => "stills",
    };
    const motion = {
      tool: "ffmpeg" as const,
      priority: 20,
      properties: { from: { video: ["gif"] }, to: { video: ["png"] } },
      convert: async () => "motion",
    };
    const forward = buildRegistry(
      { imagemagick: stills, ffmpeg: motion },
      { imagemagick: "/bin/magick", ffmpeg: "/bin/ffmpeg" },
    );
    const reversed = buildRegistry(
      { ffmpeg: motion, imagemagick: stills },
      { imagemagick: "/bin/magick", ffmpeg: "/bin/ffmpeg" },
    );
    expect(forward.converterFor("gif", "png")?.name).toBe("ffmpeg");
    expect(reversed.converterFor("gif", "png")?.name).toBe("ffmpeg");
  });

  test("falls back to the available converter when the preferred tool is missing", () => {
    const stills = {
      tool: "imagemagick" as const,
      priority: 10,
      properties: { from: { images: ["gif"] }, to: { images: ["png"] } },
      convert: async () => "stills",
    };
    const motion = {
      tool: "ffmpeg" as const,
      priority: 20,
      properties: { from: { video: ["gif"] }, to: { video: ["png"] } },
      convert: async () => "motion",
    };
    const registry = buildRegistry(
      { imagemagick: stills, ffmpeg: motion },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("gif", "png")?.name).toBe("imagemagick");
  });
```

Also add `priority: 10,` to the existing `fakeConverter` object at the top of the file, so the existing tests keep compiling.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/engine/registry.test.ts`
Expected: FAIL - `priority` is not a known property of `ConverterEntry`, or the ordering assertions fail. Report the output.

- [ ] **Step 3: Implement**

In `src/main/engine/registry.ts`, add `priority` to `ConverterEntry`:

```ts
export interface ConverterEntry {
  /** The tool this converter shells out to. */
  tool: ToolName;
  /**
   * Higher wins when more than one converter claims the same from/to pair.
   * ImageMagick and ffmpeg overlap on 45 output formats, so this must be an
   * explicit decision rather than a side effect of declaration order.
   */
  priority: number;
  properties: ConverterProperties;
  convert: (
    filePath: string,
    fileType: string,
    convertTo: string,
    targetPath: string,
    options: unknown,
    execFileOverride?: ExecFileFn,
  ) => Promise<string>;
}
```

Then sort the index once, after it is built:

```ts
  const index = available
    .map((converter) => ({
      converter,
      from: flattenInputs(converter.properties.from),
      to: flattenOutputs(converter.properties.to),
    }))
    .sort((a, b) => b.converter.priority - a.converter.priority);
```

`converterFor` already returns the first match, so sorting the index is the whole change.

- [ ] **Step 4: Confirm pass**

Run: `npx vitest run tests/engine/registry.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Prove it is not vacuous**

Temporarily remove the `.sort(...)` call. Re-run the file.
Expected: `priority beats declaration order in both directions` FAILS on the reversed case.
**Report that output**, then restore.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/registry.ts tests/engine/registry.test.ts
git commit -m "feat: order converters by explicit priority, not declaration order"
```

---

### Task 2: Compound output formats

ffmpeg advertises `av1.mp4`, `h264.mkv`, `h265.mp4`, `h266.mkv` and similar. The codec prefix is meaningful to ffmpeg - it switches `-c:v` - but it must not end up in the filename.

**Files:**
- Modify: `src/main/engine/job.ts`
- Modify: `tests/engine/job.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/engine/job.test.ts` inside the `JobRunner` describe block:

```ts
  test("names a compound output by its real extension, not the codec prefix", async () => {
    // ffmpeg advertises av1.mp4, h265.mkv and friends: the prefix selects a
    // codec, the suffix is the container. Naming the file from the whole
    // string would produce clip.av1.mp4.
    const registry = buildRegistry(
      {
        fake: {
          tool: "ffmpeg",
          priority: 20,
          properties: { from: { video: ["mov"] }, to: { video: ["av1.mp4"] } },
          convert: async () => "Done",
        },
      },
      { ffmpeg: "/bin/ffmpeg" },
    );
    const runner = new JobRunner(registry, {
      commands: { ffmpeg: "/bin/ffmpeg" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    const results = await runner.run([{ path: "/in/clip.mov", output: "av1.mp4" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    expect(results[0]?.outputPath).toBe("/out/clip.mp4");
  });

  test("passes the full compound format to the converter, not just the container", async () => {
    // The codec prefix is how ffmpeg knows to use libaom-av1. Stripping it
    // before calling convert() would silently produce the default codec.
    let seenConvertTo = "";
    const registry = buildRegistry(
      {
        fake: {
          tool: "ffmpeg",
          priority: 20,
          properties: { from: { video: ["mov"] }, to: { video: ["av1.mp4"] } },
          convert: async (_f, _t, convertTo) => {
            seenConvertTo = convertTo;
            return "Done";
          },
        },
      },
      { ffmpeg: "/bin/ffmpeg" },
    );
    const runner = new JobRunner(registry, {
      commands: { ffmpeg: "/bin/ffmpeg" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    await runner.run([{ path: "/in/clip.mov", output: "av1.mp4" }]);
    expect(seenConvertTo).toBe("av1.mp4");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/engine/job.test.ts`
Expected: the naming test FAILS with `/out/clip.av1.mp4`. The second test may already pass - `convertTo` is passed through raw today. Report which failed and say so plainly rather than contriving a failure.

- [ ] **Step 3: Implement**

In `src/main/engine/job.ts`, add this helper next to `outputWasWritten`:

```ts
/**
 * ffmpeg advertises compound targets like "av1.mp4" where the prefix selects a
 * codec and the suffix is the container. The file must be named for the
 * container alone, while the converter still receives the full string.
 */
function outputExtension(output: string): string {
  const normalized = normalizeOutputFiletype(output);
  const lastDot = normalized.lastIndexOf(".");
  return lastDot === -1 ? normalized : normalized.slice(lastDot + 1);
}
```

In `runOne`, replace:

```ts
    const extension = normalizeOutputFiletype(item.output);
```
with:
```ts
    const extension = outputExtension(item.output);
```

Leave the `converter.convert(...)` call passing `item.output` unchanged - the converter needs the full compound string.

- [ ] **Step 4: Confirm pass**

Run: `npx vitest run tests/engine/job.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/job.ts tests/engine/job.test.ts
git commit -m "fix: name compound outputs by container extension only"
```

---

### Task 3: Toolchain support for multi-binary tool suites

`KNOWN_TOOLS` maps one tool to one binary. Poppler is a suite: this plan needs `pdftoppm` and `pdftotext` from the same install directory. Adding `poppler-pdftotext` as a separate tool would duplicate every path entry and fragment poppler across entries, working against the rule that this file is the single home for platform paths.

**Files:**
- Modify: `src/main/engine/toolchain.ts`
- Modify: `tests/engine/toolchain.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/engine/toolchain.test.ts`:

```ts
describe("multi-binary tool suites", () => {
  test("resolves a named binary from a suite", () => {
    const result = resolveTool("poppler", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/pdftoppm",
      binary: "pdftoppm",
    });
    expect(result).toBe("/opt/homebrew/bin/pdftoppm");
  });

  test("resolves a sibling binary from the same suite directory", () => {
    // pdftotext lives beside pdftoppm. One entry must cover both, or the
    // platform paths get duplicated per binary.
    const result = resolveTool("poppler", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/pdftotext",
      binary: "pdftotext",
    });
    expect(result).toBe("/opt/homebrew/bin/pdftotext");
  });

  test("defaults to the suite's primary binary when none is named", () => {
    const result = resolveTool("poppler", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/pdftoppm",
    });
    expect(result).toBe("/opt/homebrew/bin/pdftoppm");
  });

  test("every suite lists its primary binary first", () => {
    for (const [name, spec] of Object.entries(KNOWN_TOOLS)) {
      expect(spec.binaries[0], `${name} must list a primary binary first`).toBe(spec.binary);
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/engine/toolchain.test.ts`
Expected: FAIL - `binary` is not a valid `ResolveOptions` field, and `spec.binaries` does not exist. Report the output.

- [ ] **Step 3: Implement**

In `src/main/engine/toolchain.ts`:

Add `binaries` to `ToolSpec`, keeping `binary` as the primary:

```ts
export interface ToolSpec {
  /** Primary executable name, without extension. Also the CommandMap key. */
  binary: string;
  /**
   * Every executable this tool provides, primary first. Most tools have one.
   * Poppler is a suite: pdftoppm, pdftotext and pdfimages ship together in the
   * same directory, and listing them here keeps their platform paths in one
   * entry instead of fragmenting them across three.
   */
  binaries: readonly string[];
  systemPaths: { darwin: string[]; win32: string[] };
}
```

Give every existing entry a `binaries` array. For the single-binary tools this is just `[binary]`. Change the `poppler` entry to:

```ts
  poppler: {
    binary: "pdftoppm",
    binaries: ["pdftoppm", "pdftotext", "pdfimages"],
    systemPaths: {
      darwin: ["/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"],
      win32: ["C:\\Program Files\\poppler\\bin\\pdftoppm.exe"],
    },
  },
```

Add an optional `binary` to `ResolveOptions`:

```ts
export interface ResolveOptions {
  platform: SupportedPlatform;
  arch: string;
  bundleDir: string;
  exists?: (p: string) => boolean;
  /** Which binary of a suite to resolve. Defaults to the tool's primary. */
  binary?: string;
}
```

In `resolveTool`, resolve the requested binary rather than always the primary. The system-path list is expressed in terms of the primary binary, so swap the filename on each candidate:

```ts
export function resolveTool(name: ToolName, options: ResolveOptions): string | null {
  const spec = KNOWN_TOOLS[name];
  const exists = options.exists ?? existsSync;
  const isWindows = options.platform === "win32";
  const join = isWindows ? path.win32.join : path.posix.join;
  const ext = isWindows ? ".exe" : "";

  const wanted = options.binary ?? spec.binary;
  if (!spec.binaries.includes(wanted)) return null;

  const bundled = join(
    options.bundleDir,
    `${options.platform}-${options.arch}`,
    `${wanted}${ext}`,
  );
  if (exists(bundled)) return bundled;

  const systemPaths = isWindows ? spec.systemPaths.win32 : spec.systemPaths.darwin;
  for (const candidate of systemPaths) {
    // systemPaths are written against the primary binary; a suite's siblings
    // live in the same directory.
    const dir = isWindows ? path.win32.dirname(candidate) : path.posix.dirname(candidate);
    const resolved = join(dir, `${wanted}${ext}`);
    if (exists(resolved)) return resolved;
  }

  return null;
}
```

`detectToolchain` keeps resolving primaries only - it answers "is this tool present".

- [ ] **Step 4: Confirm pass**

Run: `npx vitest run tests/engine/toolchain.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: all pass. Report the total.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/toolchain.ts tests/engine/toolchain.test.ts
git commit -m "feat: let one toolchain entry cover a multi-binary suite"
```

---

### Task 4: ffmpeg exec adapter

ffmpeg's `convert()` expects `(cmd, args, options, callback)` - node's real order - not the shared `ExecFileFn`'s `(cmd, args, callback, options)`. Upstream documents exactly why: an options object placed after the callback is ignored, which is the same trap Plan 1 hit as defect 8.

**Files:**
- Modify: `src/main/engine/exec.ts`
- Modify: `tests/engine/exec.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/engine/exec.test.ts`:

```ts
describe("toFfmpegExecFile", () => {
  test("reorders arguments and still resolves the absolute path", () => {
    // ffmpeg's converter uses node's real (cmd, args, options, callback)
    // order. Handing it our ExecFileFn directly would put the callback where
    // node expects options, and the options would be silently dropped - the
    // exact bug this project already fixed once.
    let seen: { cmd: string; opts: unknown; calledBack: boolean } = {
      cmd: "",
      opts: undefined,
      calledBack: false,
    };
    const base = createExecFile({ ffmpeg: "/opt/homebrew/bin/ffmpeg" }, (cmd, _a, cb, opts) => {
      seen.cmd = cmd;
      seen.opts = opts;
      cb(null, "", "");
    });
    const ffmpegExec = toFfmpegExecFile(base);
    ffmpegExec("ffmpeg", ["-i", "a.mov", "b.mp4"], { maxBuffer: 999 }, () => {
      seen.calledBack = true;
    });
    expect(seen.cmd).toBe("/opt/homebrew/bin/ffmpeg");
    expect((seen.opts as { maxBuffer?: number }).maxBuffer).toBe(999);
    expect(seen.calledBack).toBe(true);
  });

  test("surfaces a missing tool through the callback", async () => {
    const ffmpegExec = toFfmpegExecFile(createExecFile({}));
    const err = await new Promise<Error | null>((resolve) => {
      ffmpegExec("ffmpeg", [], {}, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("ffmpeg");
  });
});
```

Add `toFfmpegExecFile` to the import at the top of the file.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/engine/exec.test.ts`
Expected: FAIL - `toFfmpegExecFile` is not exported. Report the output.

- [ ] **Step 3: Implement**

Append to `src/main/engine/exec.ts`:

```ts
/**
 * ffmpeg's lifted converter takes node's real argument order,
 * (cmd, args, options, callback), rather than ExecFileFn's
 * (cmd, args, callback, options). Upstream's own comment explains why: node
 * ignores an options object placed after the callback.
 *
 * This adapts our wrapper to that shape so ffmpeg still gets absolute-path
 * resolution, shell stripping and the maxBuffer default.
 */
export type FfmpegExecFile = (
  cmd: string,
  args: string[],
  options: object,
  callback: (err: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export function toFfmpegExecFile(execFile: ExecFileFn): FfmpegExecFile {
  return (cmd, args, options, callback) => execFile(cmd, args, callback, options as never);
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx vitest run tests/engine/exec.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/exec.ts tests/engine/exec.test.ts
git commit -m "feat: adapt the exec wrapper to ffmpeg's argument order"
```

---

### Task 5: Lift the ffmpeg converter

**Files:**
- Create: `src/main/engine/converters/ffmpeg.ts` (copied from ConvertX)
- Modify: `THIRD_PARTY.md`
- Modify: `src/main/engine/index.ts`
- Test: `tests/engine/ffmpeg.test.ts`

- [ ] **Step 1: Copy from the reference clone**

```bash
SRC=/private/tmp/claude-501/-Users-cayden-Documents-GitHub-converter/3f1c4534-eb86-4ad2-8e0e-db6f18a5c536/scratchpad/convertx
cp "$SRC/src/converters/ffmpeg.ts" src/main/engine/converters/ffmpeg.ts
```

If that clone is gone: `git clone --depth 1 https://github.com/C4illin/ConvertX.git /tmp/convertx-ref` and use that.

`ffmpeg.ts` imports only from `node:child_process`, so unlike `imagemagick.ts` it needs NO import-path edit. Verify with a diff that it is byte-identical:

```bash
diff "$SRC/src/converters/ffmpeg.ts" src/main/engine/converters/ffmpeg.ts && echo "FFMPEG VERBATIM"
```

Paste that output. If it differs at all, stop and report.

- [ ] **Step 2: Record attribution**

Add to the file list in `THIRD_PARTY.md`:

```markdown
- `src/main/engine/converters/ffmpeg.ts` from `src/converters/ffmpeg.ts` (no local change)
```

- [ ] **Step 3: Write characterization tests**

`tests/engine/ffmpeg.test.ts`:

```ts
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
```

- [ ] **Step 4: Run**

Run: `npx vitest run tests/engine/ffmpeg.test.ts`
Expected: PASS, 4 tests. These characterize copied code, so they should pass immediately - that is the point. If one fails, align the TEST with what upstream actually emits; never edit the copied file.

- [ ] **Step 5: Register the converter**

In `src/main/engine/index.ts`, import ffmpeg and add it to `CONVERTERS`, and give ImageMagick an explicit priority:

```ts
import { convert as convertFfmpeg, properties as propertiesFfmpeg } from "./converters/ffmpeg";
import { toFfmpegExecFile } from "./exec";

const CONVERTERS: Record<string, ConverterEntry> = {
  // ffmpeg outranks ImageMagick on their 45 overlapping output formats: those
  // overlaps are video and animation containers, which ffmpeg handles properly
  // and ImageMagick only approximates through delegates.
  ffmpeg: {
    tool: "ffmpeg",
    priority: 20,
    properties: propertiesFfmpeg,
    convert: (filePath, fileType, convertTo, targetPath, options, execFileOverride) =>
      convertFfmpeg(
        filePath,
        fileType,
        convertTo,
        targetPath,
        options,
        execFileOverride ? (toFfmpegExecFile(execFileOverride) as never) : undefined,
      ),
  },
  imagemagick: {
    tool: "imagemagick",
    priority: 10,
    properties: propertiesImagemagick,
    convert: convertImagemagick,
  },
};
```

- [ ] **Step 6: Verify the real routing**

Run:

```bash
npx --yes tsx --eval '
import { createEngine } from "./src/main/engine/index";
const e = createEngine("/nonexistent");
console.log("tools:", Object.keys(e.toolchain).join(","));
for (const [i, o] of [["mov","mp4"],["mp4","gif"],["png","jpg"],["wav","mp3"],["gif","png"]]) {
  console.log(`${i} -> ${o}:`, e.registry.converterFor(i, o)?.name ?? "NONE");
}'
```

Expected: `mov->mp4` and `mp4->gif` and `wav->mp3` route to ffmpeg; `png->jpg` routes to imagemagick. **Report the actual output** - this is the first real check that priority does what it should on genuine format tables.

- [ ] **Step 7: Full suite, typecheck, commit**

Run: `npm test` and `npx tsc -b tsconfig.node.json tsconfig.web.json; echo "exit=$?"`

```bash
git add src/main/engine/converters/ffmpeg.ts src/main/engine/index.ts THIRD_PARTY.md tests/engine/ffmpeg.test.ts
git commit -m "feat: lift the ffmpeg converter and route video and audio to it"
```

---

### Task 6: Poppler converter for PDF input

Upstream has no poppler converter, so this module is ours. It reads PDFs, which nothing else in the bundle can do.

**Files:**
- Create: `src/main/engine/converters/poppler.ts`
- Test: `tests/engine/poppler.test.ts`
- Modify: `src/main/engine/index.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/poppler.test.ts`:

```ts
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
    expect(seen).toContain("-f");
    expect(seen).toContain("-l");
  });

  test("rejects an unsupported target", async () => {
    const mock: ExecFileFn = (_c, _a, cb) => cb(null, "", "");
    await expect(
      convert("/tmp/in.pdf", "pdf", "docx", "/tmp/out.docx", {}, mock),
    ).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/engine/poppler.test.ts`
Expected: FAIL, module not found. Report the output.

- [ ] **Step 3: Implement**

`src/main/engine/converters/poppler.ts`:

```ts
import { execFile as execFileOriginal } from "node:child_process";
import path from "node:path";
import type { ExecFileFn } from "../types";

/**
 * Poppler reads PDFs, which nothing else in the bundle can do. Upstream
 * ConvertX has no poppler converter, so this module is ours rather than lifted.
 *
 * It follows the same shape as a lifted converter - a `properties` table plus a
 * `convert()` taking an execFileOverride - so the registry and job runner treat
 * it identically.
 */
export const properties = {
  from: {
    documents: ["pdf"],
  },
  to: {
    images: ["png", "jpeg", "tiff"],
    documents: ["txt"],
  },
};

const IMAGE_FLAGS: Record<string, string> = {
  png: "-png",
  jpeg: "-jpeg",
  jpg: "-jpeg",
  tiff: "-tiff",
};

export function convert(
  filePath: string,
  _fileType: string,
  convertTo: string,
  targetPath: string,
  _options?: unknown,
  execFile: ExecFileFn = execFileOriginal as ExecFileFn,
): Promise<string> {
  const target = convertTo.toLowerCase();

  return new Promise((resolve, reject) => {
    if (target === "txt") {
      execFile("pdftotext", [filePath, targetPath], (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`pdftotext failed: ${error.message}`));
          return;
        }
        if (stderr) console.error(`stderr: ${stderr}`);
        resolve("Done");
      });
      return;
    }

    const flag = IMAGE_FLAGS[target];
    if (!flag) {
      reject(new Error(`poppler: unsupported target format ${convertTo}`));
      return;
    }

    // pdftoppm treats its final argument as a PREFIX and appends its own
    // "-1.png" suffix, so handing it the full target path would produce
    // out.png-1.png. Strip the extension and let it complete the name.
    const prefix = path.join(
      path.dirname(targetPath),
      path.basename(targetPath, path.extname(targetPath)),
    );

    // Only the first page: a multi-page PDF would otherwise emit one file per
    // page and none of them at the path the job runner expects.
    execFile(
      "pdftoppm",
      [flag, "-f", "1", "-l", "1", "-singlefile", filePath, prefix],
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`pdftoppm failed: ${error.message}`));
          return;
        }
        if (stderr) console.error(`stderr: ${stderr}`);
        resolve("Done");
      },
    );
  });
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx vitest run tests/engine/poppler.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Register it**

In `src/main/engine/index.ts`, add the import:

```ts
import { convert as convertPoppler, properties as propertiesPoppler } from "./converters/poppler";
```

and add to `CONVERTERS`:

```ts
  // Highest priority for PDF input: ImageMagick can read PDFs only through a
  // ghostscript delegate that is often absent, and it rasterizes badly.
  poppler: {
    tool: "poppler",
    priority: 30,
    properties: propertiesPoppler,
    convert: convertPoppler,
  },
```

The `commands` map is keyed by binary name, and `toCommandMap` currently emits only each tool's PRIMARY binary. `pdftotext` therefore will not resolve. Extend `toCommandMap` in `src/main/engine/exec.ts` to emit every binary of a suite:

```ts
export function toCommandMap(toolchain: Toolchain): CommandMap {
  const commands: CommandMap = {};
  for (const [name, resolved] of Object.entries(toolchain)) {
    if (!resolved) continue;
    const spec = KNOWN_TOOLS[name as ToolName];
    commands[spec.binary] = resolved;
    // A suite's siblings live beside the primary; without this, pdftotext
    // resolves to nothing while pdftoppm works.
    for (const sibling of spec.binaries) {
      if (sibling === spec.binary) continue;
      commands[sibling] = path.join(path.dirname(resolved), sibling);
    }
  }
  return commands;
}
```

Add a test for that in `tests/engine/exec.test.ts`:

```ts
  test("maps every binary of a suite, not just the primary", () => {
    const commands = toCommandMap({ poppler: "/opt/homebrew/bin/pdftoppm" });
    expect(commands.pdftoppm).toBe("/opt/homebrew/bin/pdftoppm");
    expect(commands.pdftotext).toBe("/opt/homebrew/bin/pdftotext");
  });
```

- [ ] **Step 6: Full suite, typecheck, commit**

```bash
git add src/main/engine/converters/poppler.ts src/main/engine/index.ts src/main/engine/exec.ts tests/engine/poppler.test.ts tests/engine/exec.test.ts
git commit -m "feat: add a poppler converter for PDF input"
```

---

### Task 7: Real integration tests

Every test above uses a mock. Plan 1 proved twice that mocks miss real failures - a registry advertising the wrong extension, and node silently dropping options. These tests use real binaries.

**Files:**
- Modify: `tests/fixtures/make-fixtures.ts`
- Modify: `tests/integration/convert.test.ts`

- [ ] **Step 1: Add fixture generators**

Append to `tests/fixtures/make-fixtures.ts`:

```ts
/** A 1-second silent video, generated with ffmpeg itself. */
export function ensureVideoFixture(ffmpegPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.mp4");
  if (!existsSync(target)) {
    execFileSync(ffmpegPath, [
      "-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10",
      "-pix_fmt", "yuv420p", target,
    ]);
  }
  return target;
}

/** A one-page PDF, generated with ImageMagick. */
export function ensurePdfFixture(magickPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.pdf");
  if (!existsSync(target)) {
    execFileSync(magickPath, ["-size", "120x80", "xc:white", target]);
  }
  return target;
}
```

- [ ] **Step 2: Add the tests**

Append to `tests/integration/convert.test.ts`:

```ts
describe.skipIf(!engine.toolchain.ffmpeg)("real ffmpeg conversion", () => {
  test("converts mp4 to gif and writes a valid GIF", async () => {
    const input = ensureVideoFixture(engine.toolchain.ffmpeg!);
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "gif" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const header = readFileSync(results[0]!.outputPath!).subarray(0, 3);
    expect(Buffer.from(header).toString()).toBe("GIF");
  });

  test("converts mp4 to mp3 audio", async () => {
    const input = ensureVideoFixture(engine.toolchain.ffmpeg!);
    const runner = createEngine("/nonexistent-bundle-dir").runner;
    runner.options = { ...runner.options, outputDirFor: () => outDir };
    const results = await runner.run([{ path: input, output: "mp3" }]);
    // The generated fixture has no audio track, so ffmpeg is expected to fail
    // here. What matters is that it fails HONESTLY rather than reporting a
    // success with no file - the exact bug Plan 1 fixed.
    if (results[0]?.ok) {
      expect(existsSync(results[0].outputPath!)).toBe(true);
    } else {
      expect(results[0]?.error).toBeTruthy();
    }
  });
});

describe.skipIf(!engine.toolchain.poppler || !engine.toolchain.imagemagick)(
  "real poppler conversion",
  () => {
    test("converts pdf to png and writes a valid PNG", async () => {
      const input = ensurePdfFixture(engine.toolchain.imagemagick!);
      const runner = createEngine("/nonexistent-bundle-dir").runner;
      runner.options = { ...runner.options, outputDirFor: () => outDir };
      const results = await runner.run([{ path: input, output: "png" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      const header = readFileSync(results[0]!.outputPath!).subarray(0, 4);
      expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    test("extracts text from a pdf", async () => {
      const input = ensurePdfFixture(engine.toolchain.imagemagick!);
      const runner = createEngine("/nonexistent-bundle-dir").runner;
      runner.options = { ...runner.options, outputDirFor: () => outDir };
      const results = await runner.run([{ path: input, output: "txt" }]);
      expect(results[0]?.ok, results[0]?.error).toBe(true);
      expect(existsSync(results[0]!.outputPath!)).toBe(true);
    });
  },
);
```

Update the imports at the top of the file to include `ensureVideoFixture`, `ensurePdfFixture`, and `existsSync`.

- [ ] **Step 3: Run for real**

Run: `npx vitest run tests/integration/convert.test.ts --reporter=verbose`

ffmpeg, ImageMagick and poppler are all installed on this machine, so these should genuinely execute. **Report the verbatim output, and state clearly which tests actually ran versus skipped.** A skip here is a finding, not a pass.

**The pdf-to-png test is the one most likely to surface a real bug**, because `pdftoppm`'s prefix behavior is only truly exercised against the real binary. If the output lands at an unexpected path, that is a genuine defect in `poppler.ts` - report it rather than adjusting the test to match.

- [ ] **Step 4: Full suite, typecheck, commit**

```bash
git add tests/fixtures/make-fixtures.ts tests/integration/convert.test.ts
git commit -m "test: add real ffmpeg and poppler integration coverage"
```

---

## Verified before writing this plan

These were checked against the real binaries on this machine, so treat them as settled:

- `normalizeOutputFiletype("av1.mp4")` returns `"av1.mp4"` unchanged - compound formats survive normalization, which is why `outputExtension` must split on the LAST dot rather than trusting the normalizer.
- `pdftoppm -png -f 1 -l 1 -singlefile in.pdf out` produces exactly `out.png`. Without `-singlefile` it would append a page number.
- `pdftotext in.pdf out.txt` produces `out.txt` directly.
- ImageMagick and ffmpeg overlap on 43 input and 45 output formats; ffmpeg advertises 7 compound outputs.

## Definition of Done

- Converter priority is explicit, tested, and proven to beat declaration order in both directions.
- Compound outputs like `av1.mp4` produce `clip.mp4`, while the converter still receives the full string.
- One toolchain entry covers poppler's three binaries, and `toCommandMap` resolves all of them.
- ffmpeg is lifted byte-identical, adapted to its own argument order, and outranks ImageMagick on their 45 overlapping outputs.
- Poppler reads PDFs to png, jpeg, tiff and txt.
- Integration tests convert real video and real PDFs with real binaries, and are confirmed to have actually run.
- `npm test` green, `npx tsc -b tsconfig.node.json tsconfig.web.json` exits 0, `npm run build` succeeds.

## Not In This Plan

- pandoc, potrace, vtracer, resvg, dasel, and the Electron `printToPDF` writer.
- The full UI: searchable grouped picker, per-file progress, converter options, the Formats panel.
- Binary vendoring, the checksum manifest, packaging, signing, notarization.
- Cross-run output overwrite, `JobRunnerOptions.spawn` as a test seam, and splitting `runOne` - all carried forward from Plan 1's Open Items.
