# Windows Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `Converter-<version>-setup.exe` and `Converter-<version>-portable.exe` from a GitHub Actions Windows runner, self-contained with no tools installed on the user's PC.

**Architecture:** The conversion engine already resolves Windows tool paths (`toolchain.ts` keys on `<platform>-<arch>`, appends `.exe`, joins with `path.win32.join`). Three things are missing and this plan adds them: a guard around macOS-only window chrome, a new `scripts/vendor-binaries-win.ts` that downloads pinned Windows archives into `resources/bin/win32-x64/bin/`, and an electron-builder `win` target driven by CI.

**Tech Stack:** Electron, electron-builder, TypeScript, vitest, GitHub Actions (`windows-latest`).

**Spec:** `docs/superpowers/specs/2026-09-06-windows-release-design.md`

**Branch:** `feat/windows-release`, off `main`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/main/windowOptions.ts` | **Create.** Pure function mapping a platform string to the macOS-only `BrowserWindow` chrome options. |
| `src/main/index.ts` | **Modify** (lines 19-30). Call `chromeOptionsFor` instead of hardcoding `titleBarStyle`/`vibrancy`. |
| `scripts/vendor-binaries-win.ts` | **Create.** `SOURCES` table, pure helpers, and a `main()` that downloads, verifies, and extracts. |
| `tests/main/windowOptions.test.ts` | **Create.** Covers the chrome guard. |
| `tests/scripts/vendorWin.test.ts` | **Create.** Covers the pure helpers with no network or filesystem. |
| `tests/integration/packaged.test.ts` | **Modify.** Parameterize the packaged-app path over platform. |
| `electron-builder.yml` | **Modify.** Add the `win` and `nsis` sections. |
| `package.json` | **Modify.** Add `vendor:win`, `digests:win`, `dist:win`. |
| `.github/workflows/ci.yml` | **Create.** Build and test on every PR and main push. |
| `.github/workflows/release.yml` | **Create.** Publish on `v*` tag and `workflow_dispatch`. |
| `README.md` | **Modify.** Windows install section and the SmartScreen note. |

**Strictness note, true of every code block in this plan:** `tsconfig.node.json` sets `strict` and `noUncheckedIndexedAccess`, and its `include` covers `tests/**/*`, which imports `scripts/*.ts` - so both new script files are type-checked by `npm run build`. Any array or record index yields `T | undefined` and must be bound to a local or asserted before use.

`windowOptions.ts` is its own file rather than a helper inside `index.ts` because `index.ts` imports `electron`, which cannot be loaded in a vitest process. Keeping the logic separate is what makes it testable at all - the same reason `formatsPanel.ts` and `offline.ts` are separate files.

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git checkout -b feat/windows-release
```

---

### Task 1: Guard the macOS-only window chrome

`src/main/index.ts` passes `titleBarStyle: "hiddenInset"` and `vibrancy: "sidebar"` unconditionally. Both are macOS-only. `hiddenInset` is the dangerous one: it removes the title bar, and the renderer defines no `-webkit-app-region: drag` anywhere, so on Windows the user gets a window they cannot move.

**Files:**
- Create: `src/main/windowOptions.ts`
- Create: `tests/main/windowOptions.test.ts`
- Modify: `src/main/index.ts:19-30`

- [ ] **Step 1: Write the failing test**

`tests/main/windowOptions.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { chromeOptionsFor } from "../../src/main/windowOptions";

describe("chromeOptionsFor", () => {
  test("macOS gets the inset title bar and sidebar vibrancy", () => {
    expect(chromeOptionsFor("darwin")).toEqual({
      titleBarStyle: "hiddenInset",
      vibrancy: "sidebar",
    });
  });

  test("Windows gets neither", () => {
    // hiddenInset removes the title bar. The renderer defines no
    // -webkit-app-region: drag region, so on Windows that leaves a window
    // with no title bar AND no draggable area - the user cannot move it.
    expect(chromeOptionsFor("win32")).toEqual({});
  });

  test("an unknown platform gets neither", () => {
    // Fail closed: a platform we have not looked at gets the plain system
    // title bar rather than chrome we have never seen render.
    expect(chromeOptionsFor("linux")).toEqual({});
  });

  test("never returns a key with an undefined value", () => {
    // `{ titleBarStyle: undefined }` is NOT the same as `{}` to Electron on
    // every version - spreading an explicit undefined can override a default.
    // Assert the keys are absent, not merely falsy.
    expect(Object.keys(chromeOptionsFor("win32"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/windowOptions.test.ts`
Expected: FAIL - `Failed to resolve import "../../src/main/windowOptions"`.

- [ ] **Step 3: Implement**

`src/main/windowOptions.ts`:

```ts
import type { BrowserWindowConstructorOptions } from "electron";

/**
 * The subset of BrowserWindow options that only mean anything on macOS.
 *
 * `titleBarStyle: "hiddenInset"` and `vibrancy` are documented macOS-only.
 * Passing `hiddenInset` on Windows removes the title bar, and because the
 * renderer defines no `-webkit-app-region: drag` region anywhere, the result
 * is a window the user cannot move. So the options are returned as a spread
 * rather than set unconditionally, and every non-darwin platform gets the
 * plain system title bar.
 *
 * This is a `type` import only, so the module stays loadable in a test
 * process that has no Electron runtime.
 */
export type ChromeOptions = Pick<BrowserWindowConstructorOptions, "titleBarStyle" | "vibrancy">;

export function chromeOptionsFor(platform: string): ChromeOptions {
  if (platform !== "darwin") return {};
  return { titleBarStyle: "hiddenInset", vibrancy: "sidebar" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/windowOptions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into the window**

In `src/main/index.ts`, add to the imports at the top:

```ts
import { chromeOptionsFor } from "./windowOptions";
```

Then replace the `createWindow` body's `new BrowserWindow({...})` call. It currently reads:

```ts
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    webPreferences: {
```

Change it to:

```ts
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    ...chromeOptionsFor(process.platform),
    webPreferences: {
```

Leave the rest of the call, and the rest of the file, untouched.

- [ ] **Step 6: Verify the build and full suite still pass**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 7: Confirm the Mac app is visually unchanged**

Run: `npm run dev`

Expected: the window looks exactly as before - inset traffic lights, translucent sidebar. This step exists because the guard is a refactor that must be a no-op on macOS; a regression here would be invisible to the test suite. Close the window when satisfied.

- [ ] **Step 8: Commit**

```bash
git add src/main/windowOptions.ts tests/main/windowOptions.test.ts src/main/index.ts
git commit -m "fix: keep macOS-only window chrome off Windows"
```

---

### Task 2: The Windows vendoring script - pure logic

The script is split the same way `scripts/vendor-binaries.ts` is: logic that can be tested without a network or a filesystem is exported, and the downloading lives in `main()`.

**Files:**
- Create: `scripts/vendor-binaries-win.ts`
- Create: `tests/scripts/vendorWin.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/scripts/vendorWin.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  SOURCES,
  assertDigest,
  destinationFor,
  missingMembers,
  type WindowsSource,
} from "../../scripts/vendor-binaries-win";

const fixture: WindowsSource = {
  name: "poppler",
  url: "https://example.test/Release-26.07.0-0.zip",
  sha256: "aa".repeat(32),
  archive: "zip",
  members: {
    "pdftoppm.exe": "pdftoppm.exe",
    "pdftotext.exe": "pdftotext.exe",
    "pdfimages.exe": "pdfimages.exe",
  },
};

describe("destinationFor", () => {
  test("matches an archive member by basename, ignoring its directories", () => {
    // Every one of these archives nests its executables under a versioned
    // top-level directory (poppler-24.08.0/Library/bin/...). Matching on the
    // full path would break on every upstream version bump.
    expect(destinationFor(fixture, "poppler-26.07.0/Library/bin/pdftoppm.exe")).toBe("pdftoppm.exe");
  });

  test("matches case-insensitively", () => {
    // Zip entries from Windows tooling are not consistently cased.
    expect(destinationFor(fixture, "poppler/bin/PDFTOTEXT.EXE")).toBe("pdftotext.exe");
  });

  test("ignores a member we did not ask for", () => {
    // These archives carry dozens of extra executables and DLLs. Copying
    // everything would bloat the installer with tools the app never calls.
    expect(destinationFor(fixture, "poppler/bin/pdfunite.exe")).toBeNull();
  });

  test("does not match a substring of a member name", () => {
    // "notpdftoppm.exe" must not satisfy the "pdftoppm.exe" member.
    expect(destinationFor(fixture, "poppler/bin/notpdftoppm.exe")).toBeNull();
  });
});

describe("missingMembers", () => {
  test("reports nothing when every member was found", () => {
    expect(
      missingMembers(fixture, ["a/pdftoppm.exe", "a/pdftotext.exe", "a/pdfimages.exe", "a/README"]),
    ).toEqual([]);
  });

  test("reports a member the archive did not contain", () => {
    // This is the real failure this guards: upstream reshuffles an archive,
    // extraction still "succeeds", and the app ships missing a tool that
    // then fails at conversion time in front of a user.
    expect(missingMembers(fixture, ["a/pdftoppm.exe", "a/pdftotext.exe"])).toEqual(["pdfimages.exe"]);
  });
});

describe("assertDigest", () => {
  test("accepts a matching digest regardless of case", () => {
    expect(() => assertDigest("ffff", "FFFF", "ffmpeg")).not.toThrow();
  });

  test("throws naming the tool and both digests", () => {
    // The message has to carry the actual digest, because the recovery is to
    // review the upstream change and paste the new value into SOURCES.
    expect(() => assertDigest("aaaa", "bbbb", "ffmpeg")).toThrow(/ffmpeg/);
    expect(() => assertDigest("aaaa", "bbbb", "ffmpeg")).toThrow(/aaaa/);
    expect(() => assertDigest("aaaa", "bbbb", "ffmpeg")).toThrow(/bbbb/);
  });
});

describe("SOURCES", () => {
  test("covers exactly the ten executables toolchain.ts resolves", () => {
    // KNOWN_TOOLS lists eight tools, but poppler is a suite of three
    // executables, so the bundle must contain ten. Non-executable members
    // (ImageMagick's configuration) are filtered out here and asserted
    // separately below.
    const produced = SOURCES.flatMap((source) => Object.values(source.members))
      .filter((destination) => destination.endsWith(".exe"))
      .sort();
    expect(produced).toEqual(
      [
        "dasel.exe",
        "ffmpeg.exe",
        "ffprobe.exe",
        "magick.exe",
        "pandoc.exe",
        "pdfimages.exe",
        "pdftoppm.exe",
        "pdftotext.exe",
        "potrace.exe",
        "resvg.exe",
      ].sort(),
    );
  });

  test("imagemagick carries its configuration, not just the binary", () => {
    // The portable archive is flat: magick.exe sits beside the XML that
    // ImageMagick reads from its own directory. An earlier version of this
    // table took only the .exe, which would have shipped a magick with no
    // delegate definitions, no font list and no MIME table.
    const imagemagick = SOURCES.find((source) => source.name === "imagemagick");
    const members = Object.values(imagemagick?.members ?? {});
    expect(members).toContain("delegates.xml");
    expect(members).toContain("type.xml");
    expect(members).toContain("policy.xml");
    expect(members).toContain("mime.xml");
  });

  test("every source is pinned to a concrete digest", () => {
    // An empty digest means someone ran `npm run digests:win` and never
    // pasted the result back. That would ship an unverified download.
    for (const source of SOURCES) {
      expect(source.sha256, `${source.name} has no recorded digest`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("a raw source declares exactly one member", () => {
    // main()'s raw branch takes Object.values(members)[0] as the destination.
    // More than one entry would silently drop the rest; zero would throw only
    // once someone ran the vendoring on an actual Windows machine.
    for (const source of SOURCES.filter((candidate) => candidate.archive === "raw")) {
      expect(Object.keys(source.members), `${source.name} is raw`).toHaveLength(1);
    }
  });

  test("resvg stays pinned to a release that ships a Windows asset", () => {
    // resvg v0.48.0 and v0.48.1 publish macOS assets ONLY. v0.47.0 is the
    // most recent release with resvg-win64.zip. Bumping this forward without
    // checking the asset list produces a build that silently loses SVG
    // conversion, so the constraint is asserted rather than left in a comment.
    const resvg = SOURCES.find((source) => source.name === "resvg");
    expect(resvg?.url).toContain("v0.47.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scripts/vendorWin.test.ts`
Expected: FAIL - `Failed to resolve import "../../scripts/vendor-binaries-win"`.

- [ ] **Step 3: Implement the table and the pure helpers**

Create `scripts/vendor-binaries-win.ts` with the content below. `main()` is added in Task 3; write only this much now.

```ts
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Vendors the Windows conversion tools into resources/bin/win32-x64 so the
 * packaged app converts files on a PC with nothing installed.
 *
 * This is a SIBLING of scripts/vendor-binaries.ts, not an extension of it.
 * That script exists almost entirely to solve a problem Windows does not
 * have: Homebrew binaries link their dependencies by absolute path, so it
 * walks an `otool -L` closure, rewrites every reference with
 * install_name_tool, and re-signs afterwards. Windows tools ship as
 * self-contained archives. Merging the two would produce a script that is
 * mostly dead code whichever platform it runs on.
 */

export type ArchiveKind = "zip" | "7z" | "raw";

export interface WindowsSource {
  /** Label used in log lines and error messages. */
  name: string;
  url: string;
  /** SHA-256 of the downloaded file. Refresh with `npm run digests:win`. */
  sha256: string;
  archive: ArchiveKind;
  /**
   * Archive member basename -> destination filename in bin/.
   *
   * Matched on basename because every one of these archives nests its
   * executables under a versioned top-level directory, which changes on each
   * upstream release. For a `raw` source there is exactly one entry and the
   * key is ignored.
   */
  members: Record<string, string>;
}

/**
 * Every pinned download. Versions live here and nowhere else.
 *
 * Three of these URLs are mutable in place - BtbN republishes the
 * `n9.0-latest` tag, and the poppler and potrace URLs are plain file
 * downloads with no release immutability - so each entry carries a digest
 * and a changed upstream fails the build instead of shipping silently.
 */
export const SOURCES: WindowsSource[] = [
  {
    name: "ffmpeg",
    // The GPL build, not LGPL. This project is already AGPL-3.0-or-later
    // because of the ConvertX code recorded in THIRD_PARTY.md, so GPL is
    // compatible and gives the wider codec set. Static: no DLLs to carry.
    url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-gpl-9.0.zip",
    sha256: "",
    archive: "zip",
    members: { "ffmpeg.exe": "ffmpeg.exe", "ffprobe.exe": "ffprobe.exe" },
  },
  {
    name: "imagemagick",
    // The portable build is statically linked, so unlike the Homebrew build
    // there are no dlopen'd coder modules to locate and relocate - format
    // support is compiled in. Distributed as .7z, which is why main() needs
    // 7-Zip.
    //
    // The archive is FLAT: magick.exe sits at the root beside its
    // configuration XML, and ImageMagick reads that configuration from its
    // own directory. Taking only the .exe would ship a magick with no
    // delegate definitions, no font list and no MIME table, so the
    // configuration is listed here and lands in bin/ beside the binary.
    //
    // Enumerated rather than globbed so a file disappearing upstream fails
    // the build through missingMembers(). The trade is that a config file
    // ADDED upstream has to be added here by hand.
    //
    // The archive also carries compare/composite/conjure/identify/mogrify/
    // montage/stream, each a byte-identical 31MB copy of magick.exe. Taking
    // only magick.exe saves roughly 220MB.
    url: "https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-31/ImageMagick-7.1.2-31-portable-Q16-HDRI-x64.7z",
    sha256: "",
    archive: "7z",
    members: {
      "magick.exe": "magick.exe",
      "colors.xml": "colors.xml",
      "configure.xml": "configure.xml",
      "delegates.xml": "delegates.xml",
      "english.xml": "english.xml",
      "locale.xml": "locale.xml",
      "log.xml": "log.xml",
      "mime.xml": "mime.xml",
      "policy.xml": "policy.xml",
      "thresholds.xml": "thresholds.xml",
      "type.xml": "type.xml",
      "type-ghostscript.xml": "type-ghostscript.xml",
      "sRGB.icc": "sRGB.icc",
    },
  },
  {
    name: "pandoc",
    url: "https://github.com/jgm/pandoc/releases/download/3.11/pandoc-3.11-windows-x86_64.zip",
    sha256: "",
    archive: "zip",
    members: { "pandoc.exe": "pandoc.exe" },
  },
  {
    name: "poppler",
    url: "https://github.com/oschwartz10612/poppler-windows/releases/download/v26.07.0-0/Release-26.07.0-0.zip",
    sha256: "",
    archive: "zip",
    members: {
      "pdftoppm.exe": "pdftoppm.exe",
      "pdftotext.exe": "pdftotext.exe",
      "pdfimages.exe": "pdfimages.exe",
    },
  },
  {
    name: "resvg",
    // PINNED BACKWARDS DELIBERATELY. v0.48.0 and v0.48.1 publish macOS
    // assets only; v0.47.0 is the most recent release that still ships
    // resvg-win64.zip. Check the asset list before bumping this - a forward
    // bump that 404s is obvious, but one that resolves to a macOS-only
    // release loses SVG conversion quietly.
    url: "https://github.com/linebender/resvg/releases/download/v0.47.0/resvg-win64.zip",
    sha256: "",
    archive: "zip",
    members: { "resvg.exe": "resvg.exe" },
  },
  {
    name: "dasel",
    url: "https://github.com/TomWright/dasel/releases/download/v3.11.2/dasel_windows_amd64.exe",
    sha256: "",
    archive: "raw",
    members: { "dasel_windows_amd64.exe": "dasel.exe" },
  },
  {
    name: "potrace",
    url: "https://potrace.sourceforge.net/download/1.16/potrace-1.16.win64.zip",
    sha256: "",
    archive: "zip",
    members: { "potrace.exe": "potrace.exe" },
  },
];

/**
 * The destination filename for one archive member, or null if the member is
 * not wanted.
 *
 * Matches on basename: these archives nest under a versioned top-level
 * directory that changes with every upstream release, so a full-path match
 * would break on each bump. Case-insensitive because zip entries produced by
 * Windows tooling are not consistently cased.
 */
export function destinationFor(source: WindowsSource, memberPath: string): string | null {
  const base = path.posix.basename(memberPath.replace(/\\/g, "/")).toLowerCase();
  for (const [member, destination] of Object.entries(source.members)) {
    if (member.toLowerCase() === base) return destination;
  }
  return null;
}

/**
 * Members declared in SOURCES that the archive did not actually contain.
 *
 * Guards the failure that would otherwise reach a user: upstream reshuffles
 * an archive, extraction still reports success, and the app ships without a
 * tool that only fails when someone tries to convert something.
 */
export function missingMembers(source: WindowsSource, memberPaths: string[]): string[] {
  const found = new Set(
    memberPaths
      .map((memberPath) => destinationFor(source, memberPath))
      .filter((destination): destination is string => destination !== null),
  );
  return Object.values(source.members).filter((destination) => !found.has(destination));
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertDigest(expected: string, actual: string, name: string): void {
  if (expected.toLowerCase() === actual.toLowerCase()) return;
  throw new Error(
    `${name}: SHA-256 mismatch.\n` +
      `  expected ${expected}\n` +
      `  actual   ${actual}\n` +
      `The upstream archive changed. Review the change, then update the sha256 ` +
      `for "${name}" in scripts/vendor-binaries-win.ts.`,
  );
}
```

- [ ] **Step 4: Run test to verify most pass**

Run: `npx vitest run tests/scripts/vendorWin.test.ts`

Expected: every test passes EXCEPT `every source is pinned to a concrete digest`, which fails because all seven `sha256` fields are still `""`. That is correct - Task 3 fills them in. Do not delete or skip the test to get green.

- [ ] **Step 5: Commit**

```bash
git add scripts/vendor-binaries-win.ts tests/scripts/vendorWin.test.ts
git commit -m "feat: pin the Windows tool sources"
```

---

### Task 3: The Windows vendoring script - download and extract

**Files:**
- Modify: `scripts/vendor-binaries-win.ts` (append)
- Modify: `package.json` (three script entries)

- [ ] **Step 1: Add the script entries**

In `package.json`, in `"scripts"`, after the existing `"vendor"` line:

```json
    "vendor": "npx tsx scripts/vendor-binaries.ts",
    "vendor:win": "npx tsx scripts/vendor-binaries-win.ts",
    "digests:win": "npx tsx scripts/vendor-binaries-win.ts --print-digests",
    "dist:win": "npx electron-builder --win",
```

- [ ] **Step 2: Append `main()` to the script**

Add to the top of `scripts/vendor-binaries-win.ts`, alongside the existing imports:

```ts
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
```

Then append to the end of the file:

```ts
async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Lists an archive's members and extracts them into `into`.
 *
 * Both formats go through 7-Zip. GitHub's windows-latest runners ship it
 * preinstalled, and using one extractor for both keeps zip and 7z on the
 * same code path rather than pulling in a zip library for six of the seven
 * sources and shelling out for the seventh anyway.
 */
function extract(archivePath: string, into: string): string[] {
  execFileSync(sevenZip(), ["x", "-y", `-o${into}`, archivePath], { stdio: "pipe" });
  return walk(into).map((file) => path.relative(into, file));
}

function sevenZip(): string {
  // `7z` is on PATH on GitHub's windows-latest runners. On a developer
  // machine it may not be, and a bare ENOENT from execFileSync names only
  // "7z" with no hint about what to install.
  try {
    execFileSync("7z", ["i"], { stdio: "pipe" });
    return "7z";
  } catch {
    throw new Error(
      "7-Zip not found on PATH. It is preinstalled on GitHub's windows-latest " +
        "runners; locally, install it with `winget install 7zip.7zip`.",
    );
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Downloads every source and prints its digest without extracting anything.
 *
 * This is the bootstrap for the `sha256` fields, and the recovery path when
 * a mutable upstream URL legitimately changes. It touches only the network,
 * so it runs anywhere - including a Mac, which is where this project is
 * developed.
 */
async function printDigests(): Promise<void> {
  for (const source of SOURCES) {
    const bytes = await download(source.url);
    console.log(`${sha256Of(bytes)}  ${source.name}  (${formatBytes(bytes.byteLength)})`);
  }
  console.log("\nPaste each digest into the matching SOURCES entry in scripts/vendor-binaries-win.ts.");
}

async function main(): Promise<void> {
  if (process.argv.includes("--print-digests")) {
    await printDigests();
    return;
  }

  if (process.platform !== "win32") {
    // The downloads would work anywhere, but the extracted files are Windows
    // executables. Running this on a Mac would leave a win32-x64 directory
    // that the macOS packaging step would then happily ship.
    throw new Error(
      "vendor-binaries-win.ts extracts Windows executables and must run on Windows. " +
        "Use `npm run digests:win` if you only need to refresh the digests.",
    );
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bundleRoot = path.join(repoRoot, "resources", "bin", "win32-x64");
  const binDir = path.join(bundleRoot, "bin");

  const staging = mkdtempSync(path.join(tmpdir(), "converter-vendor-win-"));
  const stagedBin = path.join(staging, "bin");
  mkdirSync(stagedBin, { recursive: true });

  try {
    for (const source of SOURCES) {
      const bytes = await download(source.url);
      assertDigest(source.sha256, sha256Of(bytes), source.name);

      if (source.archive === "raw") {
        // A bare .exe, not an archive. There is exactly one member and its
        // destination is the only thing that matters, so this path never
        // consults destinationFor.
        const destination = Object.values(source.members)[0];
        if (destination === undefined) {
          throw new Error(`${source.name}: a raw source needs exactly one members entry.`);
        }
        writeFileSync(path.join(stagedBin, destination), bytes);
        console.log(`${source.name}: ${destination} (${formatBytes(bytes.byteLength)})`);
        continue;
      }

      const archiveDir = mkdtempSync(path.join(staging, `${source.name}-`));
      const archivePath = path.join(archiveDir, path.basename(new URL(source.url).pathname));
      writeFileSync(archivePath, bytes);

      const extractRoot = path.join(archiveDir, "unpacked");
      mkdirSync(extractRoot, { recursive: true });
      const members = extract(archivePath, extractRoot);
      if (members.length === 0) {
        throw new Error(`${source.name}: the archive extracted no files at all.`);
      }

      const absent = missingMembers(source, members);
      if (absent.length > 0) {
        throw new Error(
          `${source.name}: the archive did not contain ${absent.join(", ")}. ` +
            `Upstream reshuffled its layout - update the members map in SOURCES.`,
        );
      }

      for (const member of members) {
        const destination = destinationFor(source, member);
        if (destination === null) continue;
        writeFileSync(path.join(stagedBin, destination), readFileSync(path.join(extractRoot, member)));
        console.log(`${source.name}: ${destination}`);
      }
    }

    // Only now is the previous bundle replaced. Everything above wrote into a
    // temp directory, so a digest mismatch or a failed extraction leaves the
    // last known-good bundle exactly as it was - a partially vendored bin/
    // would otherwise be packaged by electron-builder without complaint, and
    // the first thing to notice would be a user's conversion failing.
    rmSync(bundleRoot, { recursive: true, force: true });
    mkdirSync(bundleRoot, { recursive: true });
    cpSync(stagedBin, binDir, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  const files = readdirSync(binDir);
  const total = files.reduce((sum, file) => sum + statSync(path.join(binDir, file)).size, 0);
  console.log(`\nVendored ${files.length} files, ${formatBytes(total)} total.`);
}

// The same identity check scripts/vendor-binaries.ts uses. A substring test
// on argv[1] would also fire when the script is reached through any wrapper
// path that happens to contain its name; comparing resolved paths will not.
const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Fill in the digests**

Run: `npm run digests:win`

Expected: seven lines, each a 64-character hex digest, a tool name, and a size. This downloads roughly 500 MB and takes several minutes.

Copy each digest into the matching `sha256` field in `SOURCES`. Match by the printed name - the order of output is the order of the array.

- [ ] **Step 4: Verify the digest test now passes**

Run: `npx vitest run tests/scripts/vendorWin.test.ts`
Expected: PASS, all tests including `every source is pinned to a concrete digest`.

- [ ] **Step 5: Confirm the script refuses to run on macOS**

Run: `npm run vendor:win`

Expected: exits non-zero with `vendor-binaries-win.ts extracts Windows executables and must run on Windows.` The real extraction is exercised by CI in Task 6.

- [ ] **Step 6: Commit**

```bash
git add scripts/vendor-binaries-win.ts package.json
git commit -m "feat: download and extract the Windows tools"
```

---

### Task 4: electron-builder Windows target

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: Add the `win` and `nsis` sections**

Append to `electron-builder.yml`, after the existing `mac:` block:

```yaml
win:
  # build/icon.ico is the SOURCE the mac .icns was generated from, so it is
  # already in the repo at its native resolution.
  icon: build/icon.ico
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
  # No code signing: there is no Windows certificate, so SmartScreen shows an
  # unrecognised-app warning on first run. This is the Windows counterpart of
  # the unnotarized macOS build, and is documented in the README rather than
  # left for the user to discover.
nsis:
  # Per-user install, so no UAC prompt. A machine-wide install would need
  # elevation for an app that writes nothing outside the user's own files.
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  artifactName: ${productName}-${version}-setup.${ext}
portable:
  artifactName: ${productName}-${version}-portable.${ext}
```

Windows arm64 is deliberately absent: resvg publishes no arm64 Windows asset and ImageMagick's portable build is x64/x86 only, so an arm64 installer would silently lose SVG and image conversion.

- [ ] **Step 2: Verify the config parses**

Run: `npx electron-builder --win --dir --config electron-builder.yml 2>&1 | head -20`

Expected: electron-builder starts and reports `packaging platform=win32 arch=x64`. It may then fail while downloading the Windows Electron binary or because `resources/bin/win32-x64` is absent - either is fine here. A YAML parse error is not: fix the indentation if you see one.

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "feat: add the Windows installer and portable targets"
```

---

### Task 5: Parameterize the packaged test

`tests/integration/packaged.test.ts` hardcodes the macOS app path. It becomes platform-aware while keeping both of its assertions and its `skipIf` behaviour.

**Files:**
- Modify: `tests/integration/packaged.test.ts:23-38`

- [ ] **Step 1: Replace the path constants**

The file currently reads:

```ts
const APP_PATH = path.join(__dirname, "..", "..", "release", "mac-arm64", "Converter.app");
const BUNDLE_BIN = path.join(APP_PATH, "Contents", "Resources", "bin");

const appExists = existsSync(APP_PATH);
```

Replace with:

```ts
// electron-builder writes each platform's unpacked build to its own
// directory. Both layouts put the vendored tools under a "bin" directory
// inside the packaged resources, which is what BUNDLE_BIN points at and what
// the in-bundle assertion below checks against.
const APP_PATH =
  process.platform === "win32"
    ? path.join(__dirname, "..", "..", "release", "win-unpacked")
    : path.join(__dirname, "..", "..", "release", "mac-arm64", "Converter.app");

const BUNDLE_BIN =
  process.platform === "win32"
    ? path.join(APP_PATH, "resources", "bin")
    : path.join(APP_PATH, "Contents", "Resources", "bin");

const appExists = existsSync(APP_PATH);
```

- [ ] **Step 2: Update the build comment above the describe**

The comment currently reads:

```ts
// The app must be built first: `npx electron-builder --mac --dir`. That build
// takes minutes, so it is not run as part of this test - if it is missing,
// skip honestly rather than fabricate a pass.
```

Replace with:

```ts
// The app must be built first: `npx electron-builder --mac --dir` on macOS,
// `npx electron-builder --win --dir` on Windows. That build takes minutes, so
// it is not run as part of this test - if it is missing, skip honestly rather
// than fabricate a pass.
```

- [ ] **Step 3: Extend the honesty note**

The file opens with a block comment headed `HONESTY NOTE`. Append these paragraphs to it, immediately before the closing `*/`:

```
 * On WINDOWS the main caveat above mostly lifts, and the note is stronger
 * rather than weaker. This suite runs on a GitHub `windows-latest` runner,
 * a fresh machine where ImageMagick, ffmpeg, poppler, resvg, dasel and
 * potrace were never installed. A pass there is real evidence that the
 * bundle is self-contained.
 *
 * Two honest limits remain. Pandoc IS preinstalled on GitHub's Windows
 * runners, so for that one tool the "clean machine" argument does not apply
 * and the in-bundle path assertion below is doing all the work. And no
 * automated test on any platform checks what the WINDOW looks like - the
 * macOS-only chrome guard in src/main/windowOptions.ts is verified by a
 * human on a real desktop or not at all.
```

- [ ] **Step 4: Verify the macOS behaviour is unchanged**

Run: `npx vitest run tests/integration/packaged.test.ts`

Expected: identical to before the change. If `release/mac-arm64/Converter.app` is present from an earlier build, the tests run and pass; if not, they skip. Either is correct - what must NOT happen is a change in which of the two you see.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/packaged.test.ts
git commit -m "test: run the packaged test against the Windows build too"
```

---

### Task 6: CI workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      # Keyed on the vendoring script, so the cache invalidates exactly when a
      # pinned version or digest changes - the same signal the digest check
      # uses, which keeps the two from drifting apart.
      - name: Cache vendored tools
        uses: actions/cache@v4
        with:
          path: resources/bin/win32-x64
          key: win-tools-${{ hashFiles('scripts/vendor-binaries-win.ts') }}

      - name: Vendor the Windows tools
        run: npm run vendor:win

      - run: npm run build

      - run: npm test

      - name: Package (unpacked)
        run: npx electron-builder --win --dir

      # Runs only now that release/win-unpacked exists. This is the step that
      # proves the bundle is self-contained: every resolved tool path must be
      # inside the packaged tree, and real conversions must produce output
      # verified by magic bytes.
      - name: Packaged app test
        run: npx vitest run tests/integration/packaged.test.ts
```

- [ ] **Step 2: Write the release workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - name: Cache vendored tools
        uses: actions/cache@v4
        with:
          path: resources/bin/win32-x64
          key: win-tools-${{ hashFiles('scripts/vendor-binaries-win.ts') }}

      - name: Vendor the Windows tools
        run: npm run vendor:win

      - run: npm run build

      - run: npm test

      # Package unpacked first so the packaged test can run BEFORE anything is
      # published. Publishing an installer whose bundled tools were never
      # exercised is the failure this ordering prevents.
      - name: Package (unpacked)
        run: npx electron-builder --win --dir

      - name: Packaged app test
        run: npx vitest run tests/integration/packaged.test.ts

      - name: Build and publish the installers
        run: npx electron-builder --win --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # workflow_dispatch runs produce no GitHub Release, so without this the
      # .exe files from a manual run would be unreachable.
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-installers
          path: |
            release/*setup.exe
            release/*portable.exe
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: build and release the Windows app"
git push -u origin feat/windows-release
```

- [ ] **Step 4: Watch the CI run**

```bash
npx -y gh-axi run list --branch feat/windows-release
npx -y gh-axi run watch
```

Expected: the `windows` job passes every step. The first run has no cache and downloads roughly 500 MB during vendoring, so allow 15-20 minutes.

If `npm run vendor:win` fails with a SHA-256 mismatch, one of the three mutable upstream URLs changed between Task 3 and now. Re-run `npm run digests:win` locally, review what changed, update `SOURCES`, and commit.

If the packaged test fails with a tool resolving outside the bundle, the `members` map for that source is wrong - read the step's log for which tool, and check the archive's actual layout.

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current install section**

```bash
sed -n '1,60p' README.md
```

Note how the macOS download and the Gatekeeper warning are worded, so the Windows text sits alongside them in the same voice.

- [ ] **Step 2: Add the Windows install text**

Alongside the existing macOS instructions, add a Windows section covering:

- The two artifacts and the difference between them: `Converter-<version>-setup.exe` installs per-user with a Start Menu entry and an uninstaller; `Converter-<version>-portable.exe` runs from anywhere with no install.
- Windows 10 or 11, x64. No arm64 build, because two of the bundled tools publish no arm64 Windows binary.
- The SmartScreen warning: the build is unsigned, so the first run shows "Windows protected your PC" and the user must click **More info** then **Run anyway**. Word this the way the existing Gatekeeper note is worded - state it plainly, do not apologise for it.
- Nothing else needs installing. The tools ship inside the app.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Windows install instructions"
```

---

### Task 8: Verify on a real Windows desktop

CI proves the conversions work. It cannot see the window. This task is the reason the chrome guard in Task 1 is worth doing at all, and it is not optional.

- [ ] **Step 1: Get an artifact**

Either trigger the release workflow manually and download the `windows-installers` artifact:

```bash
npx -y gh-axi workflow run release.yml --ref feat/windows-release
```

or download the installer from the GitHub Release if a tag has already been pushed.

- [ ] **Step 2: Check the window**

Run the app on the Windows desktop and confirm:

- It has a normal Windows title bar with working minimise, maximise and close buttons.
- It can be dragged by the title bar and resized from its edges.
- There is no doubled or ghost title bar, and no transparent or wrongly-tinted panel where macOS shows sidebar vibrancy.

- [ ] **Step 3: Check a real conversion**

Drag a PNG onto the drop zone, convert it to JPG, and open the result. Then open the Formats panel and confirm the bundled tools are all reported as available.

- [ ] **Step 4: Record the outcome**

If anything is wrong, note exactly what and fix it before tagging a release. If everything is right, say so in the PR - this manual pass is the only evidence that exists for the window chrome, so it belongs in the record.

---

### Task 9: Ship it

- [ ] **Step 1: Open the PR**

```bash
npx -y gh-axi pr create --title "feat: Windows release" \
  --body "Adds a Windows x64 build: vendored tools, NSIS and portable targets, and CI that builds and publishes them. Implements docs/superpowers/specs/2026-09-06-windows-release-design.md"
```

- [ ] **Step 2: After merge, tag a release**

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```

Expected: `release.yml` runs and a GitHub Release appears carrying `Converter-0.1.0-setup.exe` and `Converter-0.1.0-portable.exe`.

---

## Out of scope

Recorded so a later reader does not assume these were forgotten:

- Windows arm64. Two bundled tools publish no arm64 Windows binary.
- Code signing and SmartScreen reputation.
- Auto-update. electron-builder writes `latest.yml` as a side effect of publishing; nothing consumes it.
- Moving the macOS build into CI. It stays local and unchanged.
- Linux, which `isSupportedPlatform` excludes deliberately.
