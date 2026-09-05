# Local File Converter - Plan 5: Bundling and Packaging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a double-clickable `.app` that converts files on a Mac with no Homebrew, no developer tools, and nothing else installed.

**Architecture:** Unchanged at runtime. `toolchain.ts` already prefers a bundled binary over a system one and is keyed `<platform>-<arch>`; this plan finally puts binaries there.

**Tech Stack:** Electron, electron-builder, TypeScript. macOS arm64.

**Branch:** `feat/packaging`, stacked on `feat/converters-docs-vector` (PR #4).

---

## Measured before writing this plan, not estimated

The design spec assumed bundling was a matter of copying binaries. It is not: every Homebrew tool links Homebrew dylibs by absolute path, so a copied binary crashes anywhere without Homebrew.

The real closure, measured by walking `otool -L` transitively:

| Tool | Files | Size |
|---|---|---|
| pandoc | 2 | **265.4 MB** |
| ffmpeg | 20 | 37.4 MB |
| magick | 7 | 4.0 MB |
| dasel | 1 | 9.4 MB |
| resvg | 1 | 4.4 MB |
| poppler (pdftoppm + pdftotext) | 2 | 0.5 MB |
| potrace | 2 | 0.2 MB |
| **union** | **35** | **320.9 MB** |

Two things that makes tractable: ffmpeg's 19 direct dependencies resolve to only 20 files because they are heavily shared, and 35 files is a small enough set to relocate mechanically.

**pandoc is 265MB of the 321MB total** - it is a statically-linked Haskell binary, and almost all of that is the executable itself, not dependencies. With Electron's own ~200MB the finished app lands around 520MB. That is large but not unreasonable for a converter that works offline with no install steps.

## The relocation approach, proven on a real tool

Before writing this plan, potrace was copied, relocated and run in isolation:

```
otool -L after relocation:
  @executable_path/../lib/libpotrace.0.dylib
  /usr/lib/libSystem.B.dylib
  /usr/lib/libz.1.dylib

env -i .../bin/potrace -s -o out.svg in.pbm   ->  609-byte SVG with a real <path>
```

Three facts that came out of that and shape the plan:

1. **`@executable_path/../lib/<name>` works.** Binaries in `bin/`, dylibs in `lib/`.
2. **`/usr/lib/*` and `/System/*` must NOT be relocated.** They ship with macOS and are always present. Only `/opt/homebrew/*` references are rewritten.
3. **`install_name_tool` invalidates the code signature.** It warns about this explicitly. So the order is: copy, relocate, THEN ad-hoc sign. Signing first produces a binary that will not launch.

## Signing scope

Ad-hoc (`codesign --sign -`), by decision. The available certificate is an `Apple Development` identity, which signs for your own machines but cannot notarize. The resulting app runs on your Macs after a first right-click-Open; on someone else's it shows a Gatekeeper warning.

Notarization needs a paid `Developer ID Application` certificate and is explicitly out of scope.

---

### Task 1: The vendoring script

**Files:**
- Create: `scripts/vendor-binaries.ts`
- Create: `tests/scripts/vendor.test.ts`
- Modify: `package.json` (one script entry)

- [ ] **Step 1: Write the failing test**

The script's pure logic - closure walking and install-name rewriting decisions - is testable without touching a filesystem. Its shelling out is not; keep those separate.

`tests/scripts/vendor.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { shouldRelocate, rewriteTarget, planClosure } from "../../scripts/vendor-binaries";

describe("shouldRelocate", () => {
  test("relocates homebrew paths", () => {
    expect(shouldRelocate("/opt/homebrew/lib/libpng16.16.dylib")).toBe(true);
  });

  test("leaves system libraries alone", () => {
    // These ship with macOS and are always present. Rewriting them would
    // produce a binary that cannot find libSystem and will not launch at all.
    expect(shouldRelocate("/usr/lib/libSystem.B.dylib")).toBe(false);
    expect(shouldRelocate("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")).toBe(false);
  });

  test("leaves an already-relocated reference alone", () => {
    expect(shouldRelocate("@executable_path/../lib/libpotrace.0.dylib")).toBe(false);
    expect(shouldRelocate("@rpath/libfoo.dylib")).toBe(false);
  });
});

describe("rewriteTarget", () => {
  test("points at the lib directory beside the executable", () => {
    expect(rewriteTarget("/opt/homebrew/lib/libpng16.16.dylib")).toBe(
      "@executable_path/../lib/libpng16.16.dylib",
    );
  });

  test("uses only the basename, flattening nested homebrew paths", () => {
    // Homebrew nests under Cellar/<formula>/<version>/lib. The bundle is flat.
    expect(rewriteTarget("/opt/homebrew/Cellar/libpng/1.6.43/lib/libpng16.16.dylib")).toBe(
      "@executable_path/../lib/libpng16.16.dylib",
    );
  });
});

describe("planClosure", () => {
  const graph: Record<string, string[]> = {
    "/opt/homebrew/bin/tool": ["/opt/homebrew/lib/a.dylib", "/usr/lib/libSystem.B.dylib"],
    "/opt/homebrew/lib/a.dylib": ["/opt/homebrew/lib/b.dylib"],
    "/opt/homebrew/lib/b.dylib": ["/opt/homebrew/lib/a.dylib"],
  };

  test("walks transitively", () => {
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.libraries.sort()).toEqual(["/opt/homebrew/lib/a.dylib", "/opt/homebrew/lib/b.dylib"]);
  });

  test("terminates on a dependency cycle", () => {
    // a -> b -> a. Without a visited set this never returns.
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.libraries).toHaveLength(2);
  });

  test("excludes system libraries from the closure", () => {
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.libraries).not.toContain("/usr/lib/libSystem.B.dylib");
  });

  test("keeps executables separate from libraries", () => {
    const result = planClosure(["/opt/homebrew/bin/tool"], (p) => graph[p] ?? []);
    expect(result.executables).toEqual(["/opt/homebrew/bin/tool"]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Report the output.

- [ ] **Step 3: Implement**

`scripts/vendor-binaries.ts`. Export the four pure functions the test uses, plus a `main()` that does the filesystem work.

```ts
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Vendors the conversion tools and their dylib closure into resources/bin so
 * the packaged app runs on a Mac with no Homebrew.
 *
 * Every Homebrew binary links its dependencies by absolute path, so copying
 * alone produces an app that crashes anywhere but this machine. Each reference
 * is rewritten to @executable_path/../lib/<name>.
 *
 * Order matters: install_name_tool invalidates a code signature, so binaries
 * are signed AFTER relocation, never before.
 */

const TOOLS = [
  "ffmpeg", "ffprobe", "magick", "pandoc",
  "pdftoppm", "pdftotext", "pdfimages",
  "resvg", "dasel", "potrace",
] as const;

/** Only Homebrew paths move. System libraries ship with macOS. */
export function shouldRelocate(reference: string): boolean {
  return reference.startsWith("/opt/homebrew/") || reference.startsWith("/usr/local/");
}

export function rewriteTarget(reference: string): string {
  return `@executable_path/../lib/${path.basename(reference)}`;
}

export interface ClosurePlan {
  executables: string[];
  libraries: string[];
}

/**
 * Walks the dependency graph transitively. `readDeps` is injected so the walk
 * is testable without a filesystem, and so a cycle can be exercised directly -
 * the visited set is what stops a -> b -> a from looping forever.
 */
export function planClosure(roots: string[], readDeps: (p: string) => string[]): ClosurePlan {
  const seen = new Set<string>();
  const libraries = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (!roots.includes(current)) libraries.add(current);
    for (const dep of readDeps(current)) {
      if (shouldRelocate(dep)) queue.push(dep);
    }
  }

  return { executables: [...roots], libraries: [...libraries] };
}

export function readDepsFrom(binary: string): string[] {
  const output = execFileSync("otool", ["-L", binary], { encoding: "utf8" });
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0] ?? "")
    .filter((reference) => reference.length > 0);
}
```

`main()` should: resolve each tool through `which`, build the closure with `readDepsFrom` and `realpathSync`, copy executables to `resources/bin/darwin-arm64/bin/` and libraries to `.../lib/`, `chmod u+w` each copy, rewrite every relocatable reference with `install_name_tool -change`, set each dylib's own id with `install_name_tool -id`, then `codesign --force --sign -` every file. Print a summary of file count and total size.

Add to `package.json`: `"vendor": "tsx scripts/vendor-binaries.ts"`.

- [ ] **Step 4: Confirm the tests pass**

Run: `npx vitest run tests/scripts/vendor.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run it for real**

Run: `npm run vendor`

**Report the summary.** Expect roughly 35 files and ~320MB, matching the measurement in this plan's header. A wildly different number means the closure walk is wrong.

- [ ] **Step 6: Prove the vendored binaries are actually self-contained**

This is the point of the whole task. For every vendored executable:

```bash
for f in resources/bin/darwin-arm64/bin/*; do
  echo "== $(basename $f)"
  otool -L "$f" | tail -n +2 | awk '{print $1}' | grep -E "/opt/homebrew|/usr/local" && echo "  !! STILL LINKS HOMEBREW" || echo "  ok"
done
```

Expected: no output from the grep for any binary. **Report this in full.** A single leftover reference means that tool crashes on a machine without Homebrew - the exact failure this task exists to prevent.

Then run one in isolation:

```bash
env -i resources/bin/darwin-arm64/bin/potrace --version
env -i resources/bin/darwin-arm64/bin/magick --version | head -1
```

- [ ] **Step 7: Commit**

`resources/bin/` is gitignored - the binaries must NOT be committed. Verify with `git status --short` that no binary is staged.

```bash
git add scripts/vendor-binaries.ts tests/scripts/vendor.test.ts package.json
git commit -m "build: add a script that vendors the tools and their dylib closure"
```

---

### Task 2: Point the toolchain at the bundle and prove it prefers it

`toolchain.ts` already checks `<bundleDir>/<platform>-<arch>/<binary>` before system paths, and `createEngine` already passes a bundle directory. But nothing has ever verified the packaged path resolves, because `resources/bin` has been empty since Plan 1.

**Files:**
- Modify: `src/main/engine/index.ts` (only if the packaged path is wrong)
- Modify: `tests/engine/toolchain.test.ts`

- [ ] **Step 1: Add the test**

```ts
  test("prefers a bundled binary over an identically named system one", () => {
    // The whole point of vendoring. If the system path wins, the packaged app
    // silently uses whatever Homebrew happens to have - or nothing at all on a
    // machine without it.
    const result = resolveTool("imagemagick", {
      platform: "darwin",
      arch: "arm64",
      bundleDir: "/app/resources/bin",
      exists: () => true,
    });
    expect(result).toBe("/app/resources/bin/darwin-arm64/magick");
  });
```

Note this may already pass - Plan 1 wrote it. If so, say so rather than claiming new coverage.

- [ ] **Step 2: Check the packaged layout matches**

The vendoring script writes `resources/bin/darwin-arm64/bin/<tool>` and `.../lib/<dylib>`, but `resolveTool` builds `<bundleDir>/<platform>-<arch>/<binary>` with no `bin/` segment.

**These disagree.** Decide which to change and say why in your report. Changing the script is likely simpler than changing `toolchain.ts`, which is covered by many tests - but `bin/` and `lib/` siblings are what `@executable_path/../lib` requires, so the script's layout is the one the relocation depends on.

The resolution is probably: keep the script's `bin/`+`lib/` layout and make `resolveTool` look in `<bundleDir>/<platform>-<arch>/bin/<binary>`. Update the Plan 1 tests that assert the old shape, and note in your report how many changed.

- [ ] **Step 3: Verify against the real vendored tree**

```bash
npx --yes tsx --eval '
import { detectToolchain } from "./src/main/engine/toolchain";
const t = detectToolchain({ platform: "darwin", arch: "arm64", bundleDir: "resources/bin" });
for (const [k,v] of Object.entries(t)) console.log(`  ${k.padEnd(12)} ${v}`);
'
```

**Every path must be under `resources/bin/`, not `/opt/homebrew/`.** Report it verbatim. If any tool still resolves to Homebrew, the bundle is incomplete for that tool.

- [ ] **Step 4: Commit**

```bash
git commit -m "build: resolve bundled binaries from the packaged bin directory"
```

---

### Task 3: electron-builder

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`
- Create: `build/entitlements.mac.plist`

- [ ] **Step 1: Add the dependency**

`npm install --save-dev electron-builder`

- [ ] **Step 2: Configure**

`electron-builder.yml`:

```yaml
appId: dev.cayden.converter
productName: Converter
directories:
  output: release
  buildResources: build
files:
  - out/**/*
  - package.json
# The vendored tools must stay OUTSIDE the asar archive: they are executables
# and dylibs, and macOS cannot exec or dlopen a file inside an asar.
extraResources:
  - from: resources/bin
    to: bin
    filter: ["**/*"]
asar: true
mac:
  target:
    - dmg
    - zip
  category: public.app-category.utilities
  hardenedRuntime: false
  # Ad-hoc signing by decision: the available certificate is an Apple
  # Development identity, which cannot notarize. `null` makes electron-builder
  # skip its own signing so the vendor script's ad-hoc signatures survive.
  identity: null
```

- [ ] **Step 3: Confirm the packaged app finds its binaries**

`createEngine` uses `process.resourcesPath` when packaged. Verify that resolves to the `extraResources` destination - `Converter.app/Contents/Resources/bin`.

- [ ] **Step 4: Build the app**

Run: `npx electron-builder --mac --dir` (skip dmg first - faster, and enough to test)

**This is slow.** Run it as its own command with a generous timeout.

- [ ] **Step 5: Prove the packaged app is self-contained**

```bash
APP="release/mac-arm64/Converter.app"
echo "bundled tools:"; ls "$APP/Contents/Resources/bin/darwin-arm64/bin"
echo "any homebrew links left?"
find "$APP/Contents/Resources/bin" -type f -perm +111 -exec otool -L {} \; 2>/dev/null | grep -c "/opt/homebrew" 
```

Expected: the tools listed, and a homebrew reference count of **0**.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron-builder.yml build/
git commit -m "build: package the app with electron-builder"
```

---

### Task 4: Prove it works without Homebrew

Everything above proves the binaries do not LINK Homebrew. This proves the app WORKS without it.

- [ ] **Step 1: Convert using only the bundled tools**

Point the engine at the packaged bundle and give it an environment with no Homebrew on PATH:

```bash
APP="release/mac-arm64/Converter.app"
npx --yes tsx --eval '
import { createEngine } from "./src/main/engine/index";
const e = createEngine("'"$APP"'/Contents/Resources/bin");
console.log("resolved from bundle:");
for (const [k,v] of Object.entries(e.toolchain)) console.log(`  ${k.padEnd(12)} ${v}`);
'
```

Every path must be inside the `.app`. Report it.

- [ ] **Step 2: Run real conversions through the bundled binaries**

Convert a png to jpg, a png to svg, and a csv to json using the bundled toolchain, asserting the outputs are valid. Report the results.

- [ ] **Step 3: Record the honest limit of this verification**

State plainly in your report: this proves the tools are self-contained and callable, on a machine that HAS Homebrew installed. It does not prove the app works on a machine that never had it - only copying the `.app` to a clean Mac proves that, and no such machine is available here.

Do not overclaim. A reader should know exactly what was and was not demonstrated.

---

### Task 5: Manual verification

**Human only.**

- [ ] Open `release/mac-arm64/Converter.app` by double-clicking (right-click, Open on first launch - it is ad-hoc signed)
- [ ] The Formats panel shows tools resolving from inside the app, not `/opt/homebrew`
- [ ] Convert heic to jpg, mp4 to gif, md to pdf, png to svg
- [ ] Quit, `brew unlink imagemagick ffmpeg pandoc poppler resvg dasel potrace`, relaunch, convert again, then `brew link` them back. This is the closest available proxy for a clean Mac.
- [ ] Ideally: copy the `.app` to a Mac that has never had Homebrew and convert one file

---

## Definition of Done

- `npm run vendor` produces a self-contained tool tree with no Homebrew references, proven by `otool` across every executable.
- The toolchain resolves every tool from inside the bundle rather than `/opt/homebrew`.
- `electron-builder` produces a `Converter.app` whose `Contents/Resources/bin` contains the tools and zero Homebrew links.
- Real conversions run through the bundled binaries.
- The limit of that verification is stated honestly - no clean Mac was available.
- `npm test` green, `tsc -b` exit 0.

## Open Items

**Notarization is out of scope.** Ad-hoc signing by decision; the available certificate cannot notarize. Anyone else opening the app sees a Gatekeeper warning until it is signed with a Developer ID.

**Windows packaging is untouched.** `resources/bin/` is keyed `<platform>-<arch>` and `toolchain.ts` holds the win32 paths, so the structure is ready, but no Windows binaries are vendored and no NSIS target is configured.

**pandoc is 265MB of the 321MB bundle.** If size becomes a problem, making pandoc detect-only would cut the app by half at the cost of markdown and epub conversion on a clean machine.

**Carried forward:** `openPath`/`reveal` accept unvalidated paths; poppler renders page 1 only; `md -> html` yields a fragment; `.wmv` and `.ts` gaps; per-converter options and a configurable output folder.
