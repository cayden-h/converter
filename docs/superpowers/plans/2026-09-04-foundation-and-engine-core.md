# Local File Converter - Plan 1: Foundation and Engine Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A launchable Electron app that detects installed conversion tools, converts an image file end to end through the real engine, and enforces the offline guarantee.

**Architecture:** Three layers with hard boundaries. `main/` owns the engine and is the only layer touching the filesystem or child processes. `preload/` exposes a narrow contextBridge surface. `renderer/` is a sandboxed React UI. Converter modules are lifted byte-identical from C4illin/ConvertX and receive an `execFileOverride` that maps a logical tool name to a resolved absolute path, so upstream code never needs editing.

**Tech Stack:** Electron, TypeScript, electron-vite, React, Tailwind, vitest. Node 24, npm. macOS arm64.

**Scope note:** This is the first of four plans. It delivers a working vertical slice using ImageMagick only. Later plans add the remaining converters and the PDF path, the full UI, and binary bundling plus packaging. Tools are resolved from the system in this plan; nothing is bundled yet.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
out/
dist/
.DS_Store
*.log
resources/bin/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "converter",
  "version": "0.1.0",
  "private": true,
  "license": "AGPL-3.0-or-later",
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc --noEmit && electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*", "*.config.ts"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: resolve("src/main/index.ts") },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: resolve("src/preload/index.ts") },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve("src/renderer/index.html") },
    },
  },
});
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: Create placeholder entry points**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from "electron";

app.whenReady().then(() => {
  new BrowserWindow({ width: 900, height: 640 });
});
```

`src/preload/index.ts`:

```ts
export {};
```

`src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Converter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(<h1>Converter</h1>);
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: completes with no ERR output, `node_modules/` created.

- [ ] **Step 8: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: exits 0, no output.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite project"
```

---

### Task 2: Toolchain resolution

Resolves a logical tool name to an absolute executable path. This is the ONLY file in the codebase allowed to contain a platform-specific path, per the spec's Portability rules.

**Files:**
- Create: `src/main/engine/toolchain.ts`
- Test: `tests/engine/toolchain.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/toolchain.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  resolveTool,
  detectToolchain,
  isSupportedPlatform,
  KNOWN_TOOLS,
} from "../../src/main/engine/toolchain";

describe("resolveTool", () => {
  test("returns the bundled path when the bundled binary exists", () => {
    const exists = (p: string) => p === "/bundle/bin/darwin-arm64/magick";
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists,
    });
    expect(result).toBe("/bundle/bin/darwin-arm64/magick");
  });

  test("falls back to a known system path when not bundled", () => {
    const exists = (p: string) => p === "/opt/homebrew/bin/magick";
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists,
    });
    expect(result).toBe("/opt/homebrew/bin/magick");
  });

  test("returns null when the tool is nowhere", () => {
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: () => false,
    });
    expect(result).toBeNull();
  });

  test("builds the win32 bundled path with backslashes and an .exe suffix", () => {
    // Asserts the FULL path, not just a substring. A `toContain("magick.exe")`
    // check here would pass even if the separators were wrong, which is the
    // exact bug this test exists to catch when running on a non-Windows host.
    const seen: string[] = [];
    resolveTool("imagemagick", {
      platform: "win32",
      arch: "x64",
      bundleDir: "C:\\app\\bin",
      exists: (p) => {
        seen.push(p);
        return false;
      },
    });
    expect(seen[0]).toBe("C:\\app\\bin\\win32-x64\\magick.exe");
  });

  test("builds the darwin bundled path with forward slashes and no suffix", () => {
    const seen: string[] = [];
    resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => {
        seen.push(p);
        return false;
      },
    });
    expect(seen[0]).toBe("/bundle/bin/darwin-arm64/magick");
  });

  test("prefers the bundled binary over a system one", () => {
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: () => true,
    });
    expect(result).toBe("/bundle/bin/darwin-arm64/magick");
  });

  test("every known tool declares a binary name", () => {
    for (const [name, spec] of Object.entries(KNOWN_TOOLS)) {
      expect(spec.binary, `${name} must declare a binary`).toBeTruthy();
    }
  });

  test("tries the second system path when the first is absent", () => {
    // Without this, code that ignored `exists` and always returned
    // systemPaths[0], or that iterated in reverse, would still pass every
    // other test in this file. This is the only case that exercises the loop
    // past its first iteration.
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/usr/local/bin/magick",
    });
    expect(result).toBe("/usr/local/bin/magick");
  });
});

describe("detectToolchain", () => {
  test("omits tools that did not resolve rather than storing null", () => {
    // exec.ts does a truthy check on these entries, so an unresolved tool must
    // be ABSENT from the map, not present with a null value.
    const toolchain = detectToolchain({
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: (p) => p === "/opt/homebrew/bin/ffmpeg",
    });
    expect(toolchain).toEqual({ ffmpeg: "/opt/homebrew/bin/ffmpeg" });
    expect("imagemagick" in toolchain).toBe(false);
  });

  test("resolves every known tool when all are present", () => {
    const toolchain = detectToolchain({
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/bundle/bin",
      exists: () => true,
    });
    expect(Object.keys(toolchain).sort()).toEqual(Object.keys(KNOWN_TOOLS).sort());
  });
});

describe("isSupportedPlatform", () => {
  test("accepts darwin and win32, rejects everything else", () => {
    expect(isSupportedPlatform("darwin")).toBe(true);
    expect(isSupportedPlatform("win32")).toBe(true);
    expect(isSupportedPlatform("linux")).toBe(false);
    expect(isSupportedPlatform("Darwin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/toolchain.test.ts`
Expected: FAIL, cannot resolve module `src/main/engine/toolchain`.

- [ ] **Step 3: Write the implementation**

`src/main/engine/toolchain.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";

export type ToolName = "imagemagick" | "ffmpeg" | "ffprobe" | "poppler" | "pandoc";

export interface ToolSpec {
  /** Executable name without extension. */
  binary: string;
  /**
   * Known absolute install locations per platform, searched in order after
   * the bundled directory. This object is the ONLY place in the codebase
   * that may contain a platform-specific path.
   */
  systemPaths: { darwin: string[]; win32: string[] };
}

export const KNOWN_TOOLS: Record<ToolName, ToolSpec> = {
  imagemagick: {
    binary: "magick",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/magick", "/usr/local/bin/magick"],
      win32: ["C:\\Program Files\\ImageMagick\\magick.exe"],
    },
  },
  ffmpeg: {
    binary: "ffmpeg",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"],
      win32: ["C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"],
    },
  },
  ffprobe: {
    binary: "ffprobe",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"],
      win32: ["C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe"],
    },
  },
  poppler: {
    binary: "pdftoppm",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"],
      win32: ["C:\\Program Files\\poppler\\bin\\pdftoppm.exe"],
    },
  },
  pandoc: {
    binary: "pandoc",
    systemPaths: {
      darwin: ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"],
      win32: ["C:\\Program Files\\Pandoc\\pandoc.exe"],
    },
  },
};

/** The only platforms this app resolves tools for. Linux is out of scope. */
export type SupportedPlatform = "darwin" | "win32";

export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return platform === "darwin" || platform === "win32";
}

export interface ResolveOptions {
  platform: SupportedPlatform;
  arch: string;
  bundleDir: string;
  exists?: (p: string) => boolean;
}

export function resolveTool(name: ToolName, options: ResolveOptions): string | null {
  const spec = KNOWN_TOOLS[name];
  const exists = options.exists ?? existsSync;
  const isWindows = options.platform === "win32";

  // Join with the TARGET platform's separator, not the host's. Plain
  // `path.join` uses whichever flavor the running machine has, which would
  // build "C:\\app\\bin/win32-x64/magick.exe" when resolving a Windows
  // path from a Mac.
  const join = isWindows ? path.win32.join : path.posix.join;
  const ext = isWindows ? ".exe" : "";

  const bundled = join(
    options.bundleDir,
    `${options.platform}-${options.arch}`,
    `${spec.binary}${ext}`,
  );
  if (exists(bundled)) return bundled;

  const systemPaths = isWindows ? spec.systemPaths.win32 : spec.systemPaths.darwin;
  for (const candidate of systemPaths) {
    if (exists(candidate)) return candidate;
  }

  return null;
}

export type Toolchain = Partial<Record<ToolName, string>>;

export function detectToolchain(options: ResolveOptions): Toolchain {
  const result: Toolchain = {};
  for (const name of Object.keys(KNOWN_TOOLS) as ToolName[]) {
    const resolved = resolveTool(name, options);
    if (resolved) result[name] = resolved;
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/toolchain.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/toolchain.ts tests/engine/toolchain.test.ts
git commit -m "feat: resolve conversion tools to absolute paths"
```

---

### Task 3: Exec wrapper

Lifted ConvertX converters call `execFile("magick", ...)` with a bare command name. This wrapper produces an `ExecFileFn` that rewrites that bare name into the resolved absolute path, so converter modules need no edits and never inherit a shell `PATH`.

**Files:**
- Create: `src/main/engine/types.ts`
- Create: `src/main/engine/exec.ts`
- Test: `tests/engine/exec.test.ts`

- [ ] **Step 1: Create the shared types file**

`src/main/engine/types.ts` (copied verbatim from ConvertX `src/converters/types.ts` so lifted modules import an identical shape):

```ts
import type { ChildProcess, ExecFileOptions } from "node:child_process";

export type ExecFileFn = (
  cmd: string,
  args: string[],
  callback: (err: Error | null, stdout: string, stderr: string) => void,
  options?: ExecFileOptions,
) => ChildProcess | void;

export type ConvertFnWithExecFile = (
  filePath: string,
  fileType: string,
  convertTo: string,
  targetPath: string,
  options: unknown,
  execFileOverride?: ExecFileFn,
) => Promise<string>;
```

- [ ] **Step 2: Write the failing test**

`tests/engine/exec.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createExecFile } from "../../src/main/engine/exec";

describe("createExecFile", () => {
  test("rewrites a bare command name to the resolved absolute path", () => {
    let seenCmd = "";
    const spawn = (cmd: string, _args: string[], cb: (e: null, o: string, s: string) => void) => {
      seenCmd = cmd;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/opt/homebrew/bin/magick" }, spawn);
    execFile("magick", ["a.png", "b.jpg"], () => {});
    expect(seenCmd).toBe("/opt/homebrew/bin/magick");
  });

  test("passes arguments through untouched", () => {
    let seenArgs: string[] = [];
    const spawn = (_c: string, args: string[], cb: (e: null, o: string, s: string) => void) => {
      seenArgs = args;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", ["-auto-orient", "in.png", "out.jpg"], () => {});
    expect(seenArgs).toEqual(["-auto-orient", "in.png", "out.jpg"]);
  });

  test("errors when the command is not in the resolved map", () => {
    const spawn = (_c: string, _a: string[], cb: (e: null, o: string, s: string) => void) =>
      cb(null, "", "");
    const execFile = createExecFile({}, spawn);
    let err: Error | null = null;
    execFile("magick", [], (e) => {
      err = e;
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("magick");
  });

  test("strips shell:true when a caller actually passes it", () => {
    // The caller MUST pass { shell: true } as the 4th argument. An earlier
    // version of this test never passed options at all, so `safeOptions` was
    // always {} and the assertion held even with the `delete` removed. A test
    // that cannot fail is worse than no test.
    let seenOptions: unknown;
    const spawn = (
      _c: string,
      _a: string[],
      cb: (e: null, o: string, s: string) => void,
      opts?: unknown,
    ) => {
      seenOptions = opts;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", [], () => {}, { shell: true } as never);
    expect(seenOptions).toBeDefined();
    expect((seenOptions as { shell?: unknown }).shell).toBeUndefined();
  });

  test("preserves other options while stripping shell", () => {
    let seenOptions: Record<string, unknown> | undefined;
    const spawn = (
      _c: string,
      _a: string[],
      cb: (e: null, o: string, s: string) => void,
      opts?: unknown,
    ) => {
      seenOptions = opts as Record<string, unknown>;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", [], () => {}, { shell: true, maxBuffer: 4096 } as never);
    expect(seenOptions?.maxBuffer).toBe(4096);
    expect(seenOptions?.shell).toBeUndefined();
  });

  test("reports a missing tool asynchronously, never in the same tick", async () => {
    // Real child_process.execFile always calls back on a later tick. If the
    // missing-tool path called back synchronously, consumers would see
    // different ordering depending on whether a tool happened to exist.
    const execFile = createExecFile({});
    const order: string[] = [];
    await new Promise<void>((resolve) => {
      execFile("magick", [], (err) => {
        order.push(err ? "callback" : "unexpected-success");
        resolve();
      });
      order.push("after-call");
    });
    expect(order).toEqual(["after-call", "callback"]);
  });

  test("rejects a relative resolved path rather than trusting cwd", () => {
    // toolchain.ts is supposed to only ever produce absolute paths. If a
    // relative one leaks through, Node resolves it against cwd, which is a
    // silent, cwd-dependent failure. Fail loudly instead.
    const execFile = createExecFile({ magick: "bin/magick" });
    let err: Error | null = null;
    execFile("magick", [], (e) => {
      err = e;
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("absolute");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/engine/exec.test.ts`
Expected: FAIL, cannot resolve module `src/main/engine/exec`.

- [ ] **Step 4: Write the implementation**

`src/main/engine/exec.ts`:

```ts
import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";
import type { ExecFileFn } from "./types";

/** 64MB. Generous enough for image and video tool output; node defaults to 1MB. */
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/** Maps the bare command name a converter uses to its resolved absolute path. */
export type CommandMap = Record<string, string>;

/**
 * Builds the ExecFileFn handed to lifted converter modules.
 *
 * Converters call execFile("magick", args, cb) with a bare name. We rewrite it
 * to an absolute path so nothing depends on an inherited PATH, and we always
 * pass an explicit options object with no `shell` key so a command string can
 * never reach a shell parser.
 */
export function createExecFile(
  commands: CommandMap,
  spawn: ExecFileFn = nodeExecFile as ExecFileFn,
): ExecFileFn {
  return (cmd, args, callback, options) => {
    const resolved = commands[cmd];

    // Report failures on a later tick. Real execFile is always async, and a
    // callback that is sometimes sync and sometimes async makes consumer
    // ordering depend on whether a tool happens to be installed.
    const fail = (message: string) => {
      queueMicrotask(() => callback(new Error(message), "", ""));
    };

    if (!resolved) {
      fail(`Tool not available: ${cmd}`);
      return;
    }
    if (!path.isAbsolute(resolved)) {
      fail(`Tool path must be absolute, got: ${resolved}`);
      return;
    }

    const safeOptions: Record<string, unknown> = { ...(options ?? {}) };

    // Never let a command string reach a shell parser.
    delete safeOptions.shell;

    // ExecFileFn's callback is typed for string stdout/stderr, but node decides
    // Buffer-vs-string from options.encoding at RUNTIME. A converter passing
    // "buffer" would hand Buffers to code that declares strings, and no type
    // assertion can prevent that - so enforce the contract at the boundary.
    if (safeOptions.encoding === "buffer") delete safeOptions.encoding;

    // Lifted converters are byte-identical to upstream and never set maxBuffer,
    // so without this they inherit node's 1MB default. ImageMagick and ffmpeg
    // can exceed that on large files, failing in a way that reads as a broken
    // conversion rather than a truncated pipe.
    if (safeOptions.maxBuffer === undefined) safeOptions.maxBuffer = DEFAULT_MAX_BUFFER;

    return spawn(resolved, args, callback, safeOptions);
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/engine/exec.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/types.ts src/main/engine/exec.ts tests/engine/exec.test.ts
git commit -m "feat: add exec wrapper mapping tool names to absolute paths"
```

---

### Task 4: Lift the ImageMagick converter and filetype normalization

**Files:**
- Create: `src/main/engine/converters/imagemagick.ts` (copied from ConvertX)
- Create: `src/main/engine/normalizeFiletype.ts` (copied from ConvertX)
- Create: `THIRD_PARTY.md`
- Test: `tests/engine/imagemagick.test.ts`

- [ ] **Step 1: Copy the two source files from the reference clone**

The ConvertX clone used during design lives at
`/private/tmp/claude-501/-Users-cayden-Documents-GitHub-converter/3f1c4534-eb86-4ad2-8e0e-db6f18a5c536/scratchpad/convertx`.
If it is gone, re-clone it first:

```bash
git clone --depth 1 https://github.com/C4illin/ConvertX.git /tmp/convertx-ref
```

Then copy, adjusting `SRC` to whichever path exists:

```bash
SRC=/tmp/convertx-ref
mkdir -p src/main/engine/converters
cp "$SRC/src/converters/imagemagick.ts" src/main/engine/converters/imagemagick.ts
cp "$SRC/src/helpers/normalizeFiletype.ts" src/main/engine/normalizeFiletype.ts
```

- [ ] **Step 2: Fix the one import path in the copied converter**

The copied file imports `./types`, which now resolves to `src/main/engine/converters/types.ts`, but our types live one level up. Change that single line:

```bash
sed -i '' 's|from "./types"|from "../types"|' src/main/engine/converters/imagemagick.ts
```

Verify only the import changed:

Run: `head -3 src/main/engine/converters/imagemagick.ts`
Expected:

```
import { execFile as execFileOriginal } from "node:child_process";
import { ExecFileFn } from "../types";
```

Make no other edits to this file. Keeping it identical to upstream is what lets us pull their fixes later.

- [ ] **Step 3: Record the attribution**

Create `THIRD_PARTY.md`:

```markdown
# Third-Party Code

## C4illin/ConvertX

Licensed AGPL-3.0. https://github.com/C4illin/ConvertX

The following files are copied from ConvertX and kept as close to upstream as
practical so that upstream fixes can be pulled. The only permitted local change
is the relative import path for `ExecFileFn`.

- `src/main/engine/converters/imagemagick.ts` from `src/converters/imagemagick.ts`
- `src/main/engine/normalizeFiletype.ts` from `src/helpers/normalizeFiletype.ts`
- `src/main/engine/types.ts` from `src/converters/types.ts`

Because this code is reused, this project is licensed AGPL-3.0-or-later.
```

- [ ] **Step 4: Write the failing test**

`tests/engine/imagemagick.test.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

These tests exercise copied code, so they should pass immediately. That is the point: they pin the upstream behaviour we depend on, so a future upstream pull that breaks it fails loudly.

Run: `npx vitest run tests/engine/imagemagick.test.ts`
Expected: PASS, 6 tests.

If the `ico` test fails, read the copied file's tail and align the expected define string with what upstream actually emits. Change the test, not the copied file.

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/converters/imagemagick.ts src/main/engine/normalizeFiletype.ts THIRD_PARTY.md tests/engine/imagemagick.test.ts
git commit -m "feat: lift ImageMagick converter from ConvertX with attribution"
```

---

### Task 4b: Make the toolchain-to-command remap explicit and tested

Raised by the Task 3 quality review. `Toolchain` is keyed by TOOL name (`imagemagick`); `CommandMap` is keyed by BINARY name (`magick`), because that is the bare string lifted converters actually pass to `execFile`. Both are `Record<string, string>`-shaped, so handing a `Toolchain` straight to `createExecFile` compiles cleanly and then silently resolves nothing - every conversion fails with `Tool not available: magick` while the tool sits correctly detected on disk. Task 7 does this remap inline, which leaves the invariant as tribal knowledge. Give it a name and a test.

**Files:**
- Modify: `src/main/engine/exec.ts` (add one exported function and two imports)
- Modify: `tests/engine/exec.test.ts` (add one describe block)

- [ ] **Step 1: Add the failing test**

Append to `tests/engine/exec.test.ts`, after the existing `describe("createExecFile", ...)` block:

```ts
describe("toCommandMap", () => {
  test("rekeys from tool name to the binary name converters actually call", () => {
    // The whole point: Toolchain is keyed "imagemagick", but the lifted
    // converter calls execFile("magick", ...). Without this remap the lookup
    // misses and every conversion reports the tool as unavailable.
    const commands = toCommandMap({ imagemagick: "/opt/homebrew/bin/magick" });
    expect(commands).toEqual({ magick: "/opt/homebrew/bin/magick" });
  });

  test("omits tools that did not resolve", () => {
    const commands = toCommandMap({});
    expect(commands).toEqual({});
  });

  test("round-trips through createExecFile so the wiring is proven end to end", () => {
    // Guards the actual failure mode: passing the un-remapped Toolchain here
    // would make this resolve nothing.
    let seenCmd = "";
    const spawn = (cmd: string, _a: string[], cb: (e: null, o: string, s: string) => void) => {
      seenCmd = cmd;
      cb(null, "", "");
    };
    const execFile = createExecFile(toCommandMap({ imagemagick: "/opt/homebrew/bin/magick" }), spawn);
    execFile("magick", [], () => {});
    expect(seenCmd).toBe("/opt/homebrew/bin/magick");
  });
});
```

Update the import at the top of the file to include the new function:

```ts
import { createExecFile, toCommandMap } from "../../src/main/engine/exec";
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/engine/exec.test.ts`
Expected: FAIL - `toCommandMap` is not exported.

- [ ] **Step 3: Implement**

In `src/main/engine/exec.ts`, add to the imports:

```ts
import { KNOWN_TOOLS, type ToolName, type Toolchain } from "./toolchain";
```

and append this function to the end of the file:

```ts
/**
 * Rekeys a Toolchain (keyed by tool name, e.g. "imagemagick") into a
 * CommandMap (keyed by the bare binary name a lifted converter passes to
 * execFile, e.g. "magick").
 *
 * These two shapes are both Record<string, string>, so skipping this step
 * type-checks and then silently resolves nothing. Always go through here.
 */
export function toCommandMap(toolchain: Toolchain): CommandMap {
  const commands: CommandMap = {};
  for (const [name, resolved] of Object.entries(toolchain)) {
    if (resolved) commands[KNOWN_TOOLS[name as ToolName].binary] = resolved;
  }
  return commands;
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx vitest run tests/engine/exec.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Full suite and typecheck**

Run: `npm test`
Expected: 37 tests across 4 files (toolchain 11, exec 10, imagemagick 6, registry 10).

Run: `npx tsc --noEmit; echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 6: Commit**

```bash
git add src/main/engine/exec.ts tests/engine/exec.test.ts
git commit -m "feat: add toCommandMap so the toolchain-to-binary remap is explicit"
```

---

### Task 5: Converter registry

Builds the `from -> to -> converter` index, filtered to tools that actually resolved.

**Files:**
- Create: `src/main/engine/registry.ts`
- Test: `tests/engine/registry.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/registry.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildRegistry } from "../../src/main/engine/registry";
import { normalizeOutputFiletype } from "../../src/main/engine/normalizeFiletype";

const fakeConverter = {
  properties: {
    from: { images: ["png", "jpeg", "heic"] },
    to: { images: ["png", "jpeg", "webp"] },
  },
  convert: async () => "Done",
};

describe("buildRegistry", () => {
  test("omits a converter whose tool did not resolve", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      {},
    );
    expect(registry.outputsFor("png")).toEqual([]);
  });

  test("includes a converter whose tool resolved", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.outputsFor("png")).toContain("webp");
  });

  test("normalizes the input extension before lookup", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.outputsFor("JPG")).toContain("webp");
  });

  test("returns an empty list for an unsupported input", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.outputsFor("xyz")).toEqual([]);
  });

  test("finds the converter for a supported pair", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("png", "webp")?.name).toBe("imagemagick");
  });

  test("returns null for an unroutable pair", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("png", "mp4")).toBeNull();
  });

  test("reports which tools are missing", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      {},
    );
    expect(registry.missingTools()).toEqual(["imagemagick"]);
  });

  test("offers jpg, not jpeg, so the picker matches the produced filename", () => {
    // Regression guard. The registry once folded outputs with the INPUT
    // normalizer, so it advertised "jpeg" while the written file was ".jpg".
    // A fake converter cannot catch this, hence the real format list below.
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    const outputs = registry.outputsFor("png");
    expect(outputs).toContain("jpg");
    expect(outputs).not.toContain("jpeg");
  });

  test("advertises only strings already in produced-filename form", () => {
    // The strings the picker shows BECOME the file's extension. Advertising a
    // spelling that normalizeOutputFiletype would rewrite means the UI and the
    // file on disk disagree.
    //
    // This is the load-bearing regression guard. An earlier version of this
    // test asserted only that both "jpg" and "jpeg" route to a converter,
    // which passed against the BUGGY implementation too - there both spellings
    // folded to "jpeg" and the buggy index also held "jpeg", so it matched by
    // coincidence. This invariant genuinely fails pre-fix.
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    for (const output of registry.outputsFor("png")) {
      expect(normalizeOutputFiletype(output), `advertised "${output}"`).toBe(output);
    }
  });

  test("routes both jpg and jpeg spellings to the same converter", () => {
    // Smoke test only. Note it cannot fail independently of the invariant
    // above - do not treat it as regression coverage on its own.
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    expect(registry.converterFor("png", "jpg")?.name).toBe("imagemagick");
    expect(registry.converterFor("png", "jpeg")?.name).toBe("imagemagick");
  });

  test("output list is sorted and deduplicated", () => {
    const registry = buildRegistry(
      { imagemagick: { tool: "imagemagick", ...fakeConverter } },
      { imagemagick: "/bin/magick" },
    );
    const outputs = registry.outputsFor("png");
    expect(outputs).toEqual([...new Set(outputs)].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/registry.test.ts`
Expected: FAIL, cannot resolve module `src/main/engine/registry`.

- [ ] **Step 3: Write the implementation**

`src/main/engine/registry.ts`:

```ts
import { normalizeFiletype, normalizeOutputFiletype } from "./normalizeFiletype";
import type { ToolName, Toolchain } from "./toolchain";
import type { ExecFileFn } from "./types";

export interface ConverterProperties {
  from: Record<string, string[]>;
  to: Record<string, string[]>;
}

export interface ConverterEntry {
  /** The tool this converter shells out to. */
  tool: ToolName;
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

export interface ResolvedConverter extends ConverterEntry {
  name: string;
}

export interface Registry {
  /** Output formats reachable from this input, sorted and deduplicated. */
  outputsFor(input: string): string[];
  /** The converter that handles this pair, or null if unroutable. */
  converterFor(input: string, output: string): ResolvedConverter | null;
  /** Tools that a registered converter needs but which did not resolve. */
  missingTools(): ToolName[];
  /** Every converter whose tool resolved. */
  available(): ResolvedConverter[];
}

/**
 * Input formats are folded with normalizeFiletype (jpg -> jpeg), because that
 * is the spelling converters match on when deciding what they accept.
 */
function flattenInputs(formats: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(formats)) {
    for (const format of list) out.add(normalizeFiletype(format));
  }
  return out;
}

/**
 * Output formats are folded with normalizeOutputFiletype (jpeg -> jpg),
 * because these strings are BOTH what the picker shows the user and what the
 * produced file is named. Using the input normalizer here would offer "jpeg"
 * in the UI and then write a file called ".jpg".
 */
function flattenOutputs(formats: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(formats)) {
    for (const format of list) out.add(normalizeOutputFiletype(format));
  }
  return out;
}

export function buildRegistry(
  converters: Record<string, ConverterEntry>,
  toolchain: Toolchain,
): Registry {
  const available: ResolvedConverter[] = [];
  const missing = new Set<ToolName>();

  for (const [name, entry] of Object.entries(converters)) {
    if (toolchain[entry.tool]) {
      available.push({ ...entry, name });
    } else {
      missing.add(entry.tool);
    }
  }

  const index = available.map((converter) => ({
    converter,
    from: flattenInputs(converter.properties.from),
    to: flattenOutputs(converter.properties.to),
  }));

  return {
    outputsFor(input) {
      const key = normalizeFiletype(input);
      const outputs = new Set<string>();
      for (const entry of index) {
        if (!entry.from.has(key)) continue;
        for (const format of entry.to) outputs.add(format);
      }
      return [...outputs].sort();
    },

    converterFor(input, output) {
      const from = normalizeFiletype(input);
      // Normalize the requested output the same way the `to` set was built, so
      // that both "jpg" and "jpeg" from a caller route to the same converter.
      const to = normalizeOutputFiletype(output);
      for (const entry of index) {
        if (entry.from.has(from) && entry.to.has(to)) return entry.converter;
      }
      return null;
    },

    missingTools() {
      return [...missing];
    },

    available() {
      return available;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/registry.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/registry.ts tests/engine/registry.test.ts
git commit -m "feat: add converter registry filtered by available tools"
```

---

### Task 6: Job runner

Runs conversions with a concurrency cap, progress events, per-batch output-name collision handling, and a timeout that actually kills the child process. Note it does NOT create temp directories: converters write straight to the destination, so there is nothing to stage or clean up.

**Files:**
- Create: `src/main/engine/job.ts`
- Test: `tests/engine/job.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/job.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { JobRunner } from "../../src/main/engine/job";
import { buildRegistry } from "../../src/main/engine/registry";
import { normalizeOutputFiletype } from "../../src/main/engine/normalizeFiletype";

function registryWith(convert: () => Promise<string>) {
  return buildRegistry(
    {
      fake: {
        tool: "imagemagick",
        properties: { from: { images: ["png"] }, to: { images: ["jpeg"] } },
        convert,
      },
    },
    { imagemagick: "/bin/magick" },
  );
}

describe("JobRunner", () => {
  test("reports success for a converted file", async () => {
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
    });
    const results = await runner.run([{ path: "/in/a.png", output: "jpg" }]);
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.outputPath).toBe("/out/a.jpg");
  });

  test("a failing file does not stop the others", async () => {
    let call = 0;
    const runner = new JobRunner(
      registryWith(async () => {
        call += 1;
        if (call === 1) throw new Error("boom");
        return "Done";
      }),
      { commands: { magick: "/bin/magick" }, outputDirFor: () => "/out" },
    );
    const results = await runner.run([
      { path: "/in/a.png", output: "jpg" },
      { path: "/in/b.png", output: "jpg" },
    ]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toContain("boom");
    expect(results[1]?.ok).toBe(true);
  });

  test("fails cleanly when no converter routes the pair", async () => {
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
    });
    const results = await runner.run([{ path: "/in/a.png", output: "mp4" }]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toContain("No converter");
  });

  test("emits a progress event per file", async () => {
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
    });
    const seen: string[] = [];
    runner.on("progress", (e) => seen.push(e.status));
    await runner.run([{ path: "/in/a.png", output: "jpg" }]);
    expect(seen).toContain("running");
    expect(seen).toContain("done");
  });

  test("never runs more than the concurrency cap at once", async () => {
    let active = 0;
    let peak = 0;
    const runner = new JobRunner(
      registryWith(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return "Done";
      }),
      { commands: { magick: "/bin/magick" }, outputDirFor: () => "/out", concurrency: 2 },
    );
    await runner.run(
      Array.from({ length: 6 }, (_, i) => ({ path: `/in/${i}.png`, output: "jpg" })),
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("always hands the converter an execFileOverride", async () => {
    // Lifted converters default to raw node execFile, which resolves the bare
    // command name through the inherited system PATH. That defeats the whole
    // toolchain. The override is what pins the absolute path, so the runner
    // must never call convert() without it.
    let sawOverride: unknown = "never called";
    const registry = buildRegistry(
      {
        fake: {
          tool: "imagemagick",
          properties: { from: { images: ["png"] }, to: { images: ["jpeg"] } },
          convert: async (_f, _t, _c, _p, _o, execFileOverride) => {
            sawOverride = execFileOverride;
            return "Done";
          },
        },
      },
      { imagemagick: "/bin/magick" },
    );
    const runner = new JobRunner(registry, {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
    });
    await runner.run([{ path: "/in/a.png", output: "jpg" }]);
    expect(typeof sawOverride).toBe("function");
  });

  test("times out a hung conversion", async () => {
    const runner = new JobRunner(
      registryWith(() => new Promise(() => {})),
      {
        commands: { magick: "/bin/magick" },
        outputDirFor: () => "/out",
        timeoutMs: 20,
      },
    );
    const results = await runner.run([{ path: "/in/a.png", output: "jpg" }]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toContain("Timed out");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/job.test.ts`
Expected: FAIL, cannot resolve module `src/main/engine/job`.

- [ ] **Step 3: Write the implementation**

`src/main/engine/job.ts`:

```ts
import { EventEmitter } from "node:events";
import path from "node:path";
import { createExecFile, type CommandMap } from "./exec";
import { normalizeOutputFiletype } from "./normalizeFiletype";
import type { Registry } from "./registry";

export interface JobItem {
  path: string;
  output: string;
}

export interface JobResult {
  path: string;
  ok: boolean;
  outputPath?: string;
  error?: string;
}

export interface ProgressEvent {
  path: string;
  status: "running" | "done" | "failed";
  error?: string;
}

export interface JobRunnerOptions {
  commands: CommandMap;
  outputDirFor: (inputPath: string) => string;
  concurrency?: number;
  timeoutMs?: number;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export class JobRunner extends EventEmitter {
  constructor(
    private readonly registry: Registry,
    /** Public and replaceable so tests can redirect output without reaching into privates. */
    public options: JobRunnerOptions,
  ) {
    super();
  }

  async run(items: JobItem[]): Promise<JobResult[]> {
    const concurrency = this.options.concurrency ?? DEFAULT_CONCURRENCY;
    const results = new Array<JobResult>(items.length);
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        const item = items[index]!;
        results[index] = await this.runOne(item);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
    return results;
  }

  private async runOne(item: JobItem): Promise<JobResult> {
    const inputType = path.extname(item.path).slice(1);
    const converter = this.registry.converterFor(inputType, item.output);

    if (!converter) {
      const error = `No converter available for ${inputType} to ${item.output}`;
      this.emit("progress", { path: item.path, status: "failed", error } as ProgressEvent);
      return { path: item.path, ok: false, error };
    }

    const extension = normalizeOutputFiletype(item.output);
    const base = path.basename(item.path, path.extname(item.path));
    const outputPath = path.join(this.options.outputDirFor(item.path), `${base}.${extension}`);

    this.emit("progress", { path: item.path, status: "running" } as ProgressEvent);

    const execFile = createExecFile(this.options.commands);
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      await Promise.race([
        converter.convert(item.path, inputType, item.output, outputPath, {}, execFile),
        timeout,
      ]);
      this.emit("progress", { path: item.path, status: "done" } as ProgressEvent);
      return { path: item.path, ok: true, outputPath };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      this.emit("progress", { path: item.path, status: "failed", error } as ProgressEvent);
      return { path: item.path, ok: false, error };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/job.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/engine/job.ts tests/engine/job.test.ts
git commit -m "feat: add job runner with concurrency cap and timeouts"
```

---

### Task 6b: Split tsconfig to enforce the layer boundary

Raised by the Task 1 quality review. The single root `tsconfig.json` applies `types: ["node"]` and the DOM lib to every layer, so renderer code typechecks against `fs`, `child_process`, and `process` even though it runs with `nodeIntegration: false` and `sandbox: true`. TypeScript would not catch a renderer file importing a Node builtin; it would surface as a runtime crash. This must land before Tasks 7 and 8 write real main and renderer code.

**Files:**
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Modify: `tsconfig.json` (replace entirely)
- Modify: `package.json` (the `build` script only)

- [ ] **Step 1: Create `tsconfig.node.json` for main, preload, shared, and tests**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "tests/**/*", "*.config.ts"]
}
```

Note there is no `DOM` lib here. Main-process code that references `document` or a DOM-flavored `fetch` type now fails to compile.

- [ ] **Step 2: Create `tsconfig.web.json` for the renderer**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

`"types": []` is the load-bearing line. It removes `@types/node` from the renderer program, so a renderer file importing `node:fs` or referencing `process` now fails to compile. `src/shared/**/*` appears in both projects deliberately: shared IPC types must compile under both, which is exactly the constraint we want on them.

- [ ] **Step 3: Replace `tsconfig.json` with a solution file**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

- [ ] **Step 4: Point the build script at both projects**

In `package.json`, change the `build` script from:

```
"build": "tsc --noEmit && electron-vite build",
```

to:

```
"build": "tsc -b tsconfig.node.json tsconfig.web.json && electron-vite build",
```

Leave every other script unchanged.

- [ ] **Step 5: Verify both projects typecheck**

Run: `npx tsc -b tsconfig.node.json tsconfig.web.json; echo "exit=$?"`
Expected: `exit=0`.

Note: `tsc -b` with `noEmit` requires TypeScript 5.6 or newer. The installed version is 5.9.3, so this is fine.

- [ ] **Step 6: Prove the boundary is actually enforced**

This is the point of the task, so verify it rather than assuming. Temporarily append to `src/renderer/main.tsx`:

```ts
import { existsSync } from "node:fs";
console.log(existsSync);
```

Run: `npx tsc -b tsconfig.web.json; echo "exit=$?"`
Expected: NON-ZERO exit, with an error like `Cannot find module 'node:fs' or its corresponding type declarations`.

If it exits 0, the boundary is not enforced and the task is not done. Investigate before proceeding.

Then remove those two lines and re-run to confirm `exit=0` again.

- [ ] **Step 7: Confirm the test suite still runs**

Run: `npm test`
Expected: all existing suites still pass. Vitest does not read `tsconfig.json` for test discovery, so this should be unaffected, but confirm rather than assume.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json package.json
git commit -m "build: split tsconfig so renderer cannot reference node builtins"
```

---

### Task 7: Electron main process, offline enforcement, and IPC

**Files:**
- Create: `src/main/engine/index.ts`
- Create: `src/main/offline.ts`
- Modify: `src/main/index.ts` (replace the Task 1 placeholder entirely)
- Create: `src/preload/index.ts` (replace the Task 1 placeholder entirely)
- Create: `src/shared/ipc.ts`
- Test: `tests/main/offline.test.ts`

- [ ] **Step 1: Write the failing test for offline enforcement**

`tests/main/offline.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { isAllowedRequest } from "../../src/main/offline";

describe("isAllowedRequest", () => {
  test("allows file URLs", () => {
    expect(isAllowedRequest("file:///Applications/Converter.app/index.html")).toBe(true);
  });

  test("allows devtools URLs", () => {
    expect(isAllowedRequest("devtools://devtools/bundled/inspector.html")).toBe(true);
  });

  test("blocks https", () => {
    expect(isAllowedRequest("https://example.com/x.js")).toBe(false);
  });

  test("blocks http", () => {
    expect(isAllowedRequest("http://localhost:9999/telemetry")).toBe(false);
  });

  test("blocks websockets", () => {
    expect(isAllowedRequest("wss://example.com/socket")).toBe(false);
  });

  test("blocks a malformed url rather than defaulting open", () => {
    expect(isAllowedRequest("not a url")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/offline.test.ts`
Expected: FAIL, cannot resolve module `src/main/offline`.

- [ ] **Step 3: Write the offline enforcement module**

`src/main/offline.ts`:

```ts
import type { Session } from "electron";

const ALLOWED_PROTOCOLS = new Set(["file:", "devtools:", "blob:", "data:"]);

/**
 * The app must never reach the network. We allowlist local schemes and block
 * everything else, so the guarantee holds even for code we did not write.
 */
export function isAllowedRequest(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function enforceOffline(session: Session): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRequest(details.url) });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/offline.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Define the IPC contract**

`src/shared/ipc.ts`:

```ts
export interface ToolStatus {
  name: string;
  available: boolean;
  path?: string;
}

export interface ConvertRequest {
  path: string;
  output: string;
}

export interface ConvertResult {
  path: string;
  ok: boolean;
  outputPath?: string;
  error?: string;
}

export const IPC = {
  detectTools: "converter:detectTools",
  outputsFor: "converter:outputsFor",
  run: "converter:run",
  reveal: "converter:reveal",
} as const;

export interface ConverterApi {
  detectTools(): Promise<ToolStatus[]>;
  outputsFor(extension: string): Promise<string[]>;
  run(items: ConvertRequest[]): Promise<ConvertResult[]>;
  reveal(path: string): Promise<void>;
  /**
   * Resolves a dropped File to its absolute path.
   *
   * Electron 32 REMOVED `File.path`, so a renderer cannot read it directly any
   * more; `webUtils.getPathForFile` in the preload is the replacement. Typed as
   * `unknown` rather than `File` because this file compiles under both the node
   * and web tsconfig projects, and the node project has no DOM lib.
   */
  pathForFile(file: unknown): string;
}
```

- [ ] **Step 6: Wire the engine together**

`src/main/engine/index.ts`:

```ts
import path from "node:path";
import { convert as convertImagemagick, properties as propertiesImagemagick } from "./converters/imagemagick";
import { JobRunner } from "./job";
import { buildRegistry, type ConverterEntry, type Registry } from "./registry";
import {
  detectToolchain,
  isSupportedPlatform,
  KNOWN_TOOLS,
  type ToolName,
  type Toolchain,
} from "./toolchain";
import { toCommandMap } from "./exec";

const CONVERTERS: Record<string, ConverterEntry> = {
  imagemagick: {
    tool: "imagemagick",
    properties: propertiesImagemagick,
    convert: convertImagemagick,
  },
};

export interface Engine {
  registry: Registry;
  toolchain: Toolchain;
  runner: JobRunner;
}

export function createEngine(bundleDir: string): Engine {
  // ResolveOptions.platform is narrowed to the platforms we actually ship, so
  // an unsupported OS fails here with a clear message instead of silently
  // resolving macOS paths.
  if (!isSupportedPlatform(process.platform)) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  const toolchain = detectToolchain({
    platform: process.platform,
    arch: process.arch,
    bundleDir,
  });

  const registry = buildRegistry(CONVERTERS, toolchain);

  // Rekeys tool names to binary names. See toCommandMap's doc comment for why
  // skipping this silently breaks every conversion.
  const commands = toCommandMap(toolchain);

  const runner = new JobRunner(registry, {
    commands,
    outputDirFor: (inputPath) => path.dirname(inputPath),
  });

  return { registry, toolchain, runner };
}
```

- [ ] **Step 7: Replace the main process entry point**

Replace the entire contents of `src/main/index.ts`:

```ts
import { app, BrowserWindow, ipcMain, shell, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./engine";
import { enforceOffline } from "./offline";
import { KNOWN_TOOLS, type ToolName } from "./engine/toolchain";
import { IPC, type ConvertRequest } from "../shared/ipc";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = app.isPackaged
  ? path.join(process.resourcesPath, "bin")
  : path.join(dirname, "../../resources/bin");

const engine = createEngine(bundleDir);

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    webPreferences: {
      preload: path.join(dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  enforceOffline(session.defaultSession);

  ipcMain.handle(IPC.detectTools, () =>
    (Object.keys(KNOWN_TOOLS) as ToolName[]).map((name) => ({
      name,
      available: Boolean(engine.toolchain[name]),
      path: engine.toolchain[name],
    })),
  );

  ipcMain.handle(IPC.outputsFor, (_event, extension: string) =>
    engine.registry.outputsFor(extension),
  );

  ipcMain.handle(IPC.run, (_event, items: ConvertRequest[]) => engine.runner.run(items));

  ipcMain.handle(IPC.reveal, (_event, target: string) => {
    shell.showItemInFolder(target);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

Note the dev-mode caveat: `enforceOffline` blocks the Vite dev server, which is served over http. Task 8 Step 5 covers running against a built renderer so the offline rule is exercised as shipped.

- [ ] **Step 8: Replace the preload script**

Replace the entire contents of `src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC, type ConvertRequest, type ConverterApi } from "../shared/ipc";

const api: ConverterApi = {
  detectTools: () => ipcRenderer.invoke(IPC.detectTools),
  outputsFor: (extension: string) => ipcRenderer.invoke(IPC.outputsFor, extension),
  run: (items: ConvertRequest[]) => ipcRenderer.invoke(IPC.run, items),
  reveal: (target: string) => ipcRenderer.invoke(IPC.reveal, target),
  // `as never` avoids needing the DOM `File` type here: this file compiles
  // under the node tsconfig project, which deliberately has no DOM lib.
  pathForFile: (file: unknown) => webUtils.getPathForFile(file as never),
};

contextBridge.exposeInMainWorld("converter", api);
```

- [ ] **Step 9: Verify typecheck passes**

Run: `npx tsc -b tsconfig.node.json tsconfig.web.json; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 10: Commit**

```bash
git add src/main src/preload src/shared tests/main
git commit -m "feat: wire engine into electron main with offline enforcement"
```

---

### Task 8: Minimal renderer

Enough UI to prove the slice end to end. The full UI from the spec is a later plan.

**Files:**
- Create: `src/renderer/env.d.ts`
- Modify: `src/renderer/main.tsx` (replace the Task 1 placeholder entirely)
- Create: `src/renderer/App.tsx`

- [ ] **Step 1: Declare the injected API for TypeScript**

`src/renderer/env.d.ts`:

```ts
import type { ConverterApi } from "../shared/ipc";

declare global {
  interface Window {
    converter: ConverterApi;
  }
}

export {};
```

- [ ] **Step 2: Write the App component**

`src/renderer/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ConvertResult, ToolStatus } from "../shared/ipc";

interface Dropped {
  path: string;
  name: string;
  extension: string;
}

export function App() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [file, setFile] = useState<Dropped | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [results, setResults] = useState<ConvertResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.converter.detectTools().then(setTools);
  }, []);

  useEffect(() => {
    if (!file) return;
    window.converter.outputsFor(file.extension).then((list) => {
      setOutputs(list);
      setTarget(list[0] ?? "");
    });
  }, [file]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;
    // Electron 32 removed File.path. Reading it here would silently yield
    // undefined and drag-and-drop would never work, so go through the preload's
    // webUtils bridge instead.
    const path = window.converter.pathForFile(dropped);
    const extension = dropped.name.split(".").pop() ?? "";
    setFile({ path, name: dropped.name, extension });
    setResults([]);
  };

  const onConvert = async () => {
    if (!file || !target) return;
    setBusy(true);
    setResults(await window.converter.run([{ path: file.path, output: target }]));
    setBusy(false);
  };

  return (
    <main
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{ fontFamily: "system-ui", padding: 24 }}
    >
      <h1>Converter</h1>

      <section
        style={{ border: "2px dashed #999", borderRadius: 12, padding: 32, textAlign: "center" }}
      >
        {file ? file.name : "Drop a file here"}
      </section>

      {file && (
        <section style={{ marginTop: 16 }}>
          <label>
            Convert to{" "}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {outputs.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <button onClick={onConvert} disabled={busy || !target} style={{ marginLeft: 12 }}>
            {busy ? "Converting..." : "Convert"}
          </button>
        </section>
      )}

      {results.map((result) => (
        <p key={result.path}>
          {result.ok ? (
            <>
              Done: {result.outputPath}{" "}
              <button onClick={() => window.converter.reveal(result.outputPath!)}>Reveal</button>
            </>
          ) : (
            <>Failed: {result.error}</>
          )}
        </p>
      ))}

      <details style={{ marginTop: 32 }}>
        <summary>Formats</summary>
        <ul>
          {tools.map((tool) => (
            <li key={tool.name}>
              {tool.name}: {tool.available ? tool.path : "not installed"}
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
```

- [ ] **Step 3: Replace the renderer entry point**

Replace the entire contents of `src/renderer/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc -b tsconfig.node.json tsconfig.web.json; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 5: Build and run the app for real** (MANUAL - a subagent cannot do this)

This step needs a human at the keyboard: it involves launching a GUI and dragging a file onto a window. An automated worker should build, typecheck, and stop, leaving this for the user. Task 9 covers the same conversion path headlessly, so automated verification does not depend on this step.

ImageMagick is not installed on this machine, so install it first:

```bash
brew install imagemagick
```

Then build and launch:

```bash
npm run build
npm start
```

Expected: a window opens. Expand Formats and confirm `imagemagick` shows an absolute path and `ffmpeg` shows `/opt/homebrew/bin/ffmpeg`.

Drag a `.png` onto the window, pick `jpg`, click Convert. Expected: a `.jpg` appears next to the original, and Reveal opens it in Finder.

If nothing converts, check the main process console for `Tool not available`, which means toolchain resolution missed the install path. Add the correct path to `KNOWN_TOOLS` in `src/main/engine/toolchain.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat: add minimal renderer for the convert slice"
```

---

### Task 9: End-to-end integration test

Proves the engine converts a real file with a real binary, not a mock.

**Files:**
- Create: `tests/integration/convert.test.ts`
- Create: `tests/fixtures/make-fixtures.ts`

- [ ] **Step 1: Write the fixture generator**

`tests/fixtures/make-fixtures.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generates a small PNG with ImageMagick itself. Generating rather than
 * committing a binary fixture keeps the repo clean and proves the tool works.
 */
export function ensurePngFixture(magickPath: string): string {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "sample.png");
  if (!existsSync(target)) {
    execFileSync(magickPath, ["-size", "64x64", "xc:red", target]);
  }
  return target;
}
```

- [ ] **Step 2: Write the failing test**

`tests/integration/convert.test.ts`:

```ts
import { existsSync, rmSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createEngine } from "../../src/main/engine";
import { ensurePngFixture } from "../fixtures/make-fixtures";

const engine = createEngine("/nonexistent-bundle-dir");
const magick = engine.toolchain.imagemagick;

const outDir = mkdtempSync(path.join(tmpdir(), "converter-test-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe.skipIf(!magick)("real conversion", () => {
  test("converts png to jpg and writes a valid JPEG", async () => {
    const input = ensurePngFixture(magick!);
    const engineForTest = createEngine("/nonexistent-bundle-dir");
    engineForTest.runner.options = {
      ...engineForTest.runner.options,
      outputDirFor: () => outDir,
    };

    const results = await engineForTest.runner.run([{ path: input, output: "jpg" }]);

    expect(results[0]?.ok, results[0]?.error).toBe(true);
    const output = results[0]!.outputPath!;
    expect(existsSync(output)).toBe(true);

    // JPEG files start with the SOI marker FF D8 FF.
    const header = readFileSync(output).subarray(0, 3);
    expect([...header]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("reports a clear error for an unroutable pair", async () => {
    const input = ensurePngFixture(magick!);
    const results = await engine.runner.run([{ path: input, output: "mp4" }]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toContain("No converter");
  });
});
```

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run tests/integration/convert.test.ts`
Expected: PASS, 2 tests. If ImageMagick is not installed the suite skips rather than fails.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all suites pass. Total should be 58 tests across 7 files: toolchain 11, exec 12, imagemagick 6, registry 11, job 10, offline 6, integration 2.

- [ ] **Step 5: Verify typecheck still passes**

Run: `npx tsc -b tsconfig.node.json tsconfig.web.json; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 6: Commit and push**

```bash
git add tests/integration tests/fixtures
git commit -m "test: add real png to jpg integration test"
git push origin main
```

---

## Definition of Done

- `npm test` passes with unit coverage of toolchain, exec, registry, job, offline, and the lifted converter, plus a real png to jpg integration test.
- `npx tsc -b tsconfig.node.json tsconfig.web.json` exits 0, and a renderer file importing a Node builtin fails to compile.
- `npm run build && npm start` opens a window, lists detected tools with absolute paths, and converts a dropped png to jpg with Reveal working.
- No platform-specific path exists outside `src/main/engine/toolchain.ts`.
- `THIRD_PARTY.md` records the ConvertX attribution and the AGPL-3.0 obligation.

## Not In This Plan

- The remaining converters (ffmpeg, poppler, pandoc, potrace, vtracer, resvg, dasel) and the Electron `printToPDF` writer.
- The full UI from the spec: searchable grouped picker, per-file progress rows, converter options, greyed-out unroutable formats, the Formats panel with install commands and the Office gap callout.
- Binary vendoring into `resources/bin/`, the checksum manifest, and the HEIC-capable ImageMagick build.
- Packaging, code signing, and notarization.
- Playwright end to end coverage.
