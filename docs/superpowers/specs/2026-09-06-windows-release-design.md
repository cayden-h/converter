# Local File Converter - Windows Release Design

**Goal:** Ship a double-clickable Windows `.exe` that converts files on a PC with nothing else installed, matching what the macOS build already does.

**Status:** Design approved 2026-09-06. Not yet implemented.

---

## Why this is small

The runtime was written platform-aware from the start.
`src/main/engine/toolchain.ts` already keys bundled tools as `<platform>-<arch>`, already appends `.exe` on Windows, already joins with `path.win32.join` rather than the host separator, and already carries a `systemPaths.win32` list for every tool.
`src/main/formatsPanel.ts` already reports a `win32` platform.
`src/main/index.ts` already quits on `window-all-closed` for non-darwin.

Nothing in the conversion engine needs to change.
What is missing is three things: window chrome that is macOS-only, a way to get Windows binaries into `resources/bin/win32-x64`, and an electron-builder target plus the CI to run it.

## Scope

Windows **x64 only**.
Windows arm64 is out of scope because two of the seven tools ship no arm64 Windows binary: resvg publishes only `resvg-win64.zip`, and ImageMagick's portable build is x64 or x86 only.
Shipping an arm64 installer that silently loses SVG rendering and image conversion would be worse than shipping nothing.

The macOS build is unchanged and stays local.
This work adds Windows; it does not move the mac build into CI.

---

## 1. Window chrome

`src/main/index.ts` constructs its `BrowserWindow` with `titleBarStyle: "hiddenInset"` and `vibrancy: "sidebar"`.
Both are macOS-only.

`hiddenInset` is the dangerous one.
The renderer defines no `-webkit-app-region: drag` region anywhere, because on macOS the inset traffic lights supply one.
On Windows the same option produces a window with no title bar and no draggable area, which the user cannot move at all.

Both options move behind a `process.platform === "darwin"` guard.
Windows gets the standard system title bar.

This is the one change that every automated test will pass and a human still has to look at.

## 2. Windows vendoring

A new script, `scripts/vendor-binaries-win.ts`, sitting beside the existing `scripts/vendor-binaries.ts` rather than extending it.

They share a destination layout and nothing else.
The mac script exists almost entirely to solve a problem Windows does not have: every Homebrew binary links its dependencies by absolute path, so that script walks an `otool -L` closure, rewrites each reference with `install_name_tool`, and re-signs afterwards.
Windows tools ship as self-contained archives.
Folding the two together would mean a script that is mostly dead code on whichever platform it runs.

### Sources

Every version is pinned in one `SOURCES` table at the top of the script.

| Tool | Source | Archive | Pin |
|---|---|---|---|
| ffmpeg, ffprobe | BtbN/FFmpeg-Builds | `ffmpeg-n9.0-latest-win64-gpl.zip` | static GPL build |
| magick | ImageMagick/ImageMagick | `ImageMagick-<v>-portable-Q16-HDRI-x64.7z` | 7.1.2-31 |
| pandoc | jgm/pandoc | `pandoc-<v>-windows-x86_64.zip` | 3.11 |
| pdftoppm, pdftotext, pdfimages | oschwartz10612/poppler-windows | `Release-<v>.zip` | v26.07.0-0 |
| resvg | linebender/resvg | `resvg-win64.zip` | **v0.47.0** |
| dasel | TomWright/dasel | `dasel_windows_amd64.exe` | v3.11.2 |
| potrace | potrace.sourceforge.net | `potrace-1.16.win64.zip` | 1.16 |

Two of these deserve explanation.

**resvg is pinned backwards on purpose.**
The current release is v0.48.1, but v0.48.0 and v0.48.1 publish macOS assets only.
v0.47.0 is the most recent release that still ships `resvg-win64.zip`.
Anyone bumping this pin forward without checking assets will produce a build that silently loses SVG conversion, so the reason is recorded next to the pin.

**ffmpeg is the GPL build, not LGPL.**
This project is already AGPL-3.0-or-later because of the ConvertX code documented in `THIRD_PARTY.md`, so the GPL build is compatible and gives the wider codec set.

### Integrity

Each download is verified against a recorded SHA-256 before extraction.
Three of the seven sources are mutable in place: BtbN republishes `ffmpeg-n9.0-latest-*` under a rolling tag, and the poppler and potrace URLs are plain file downloads with no release immutability.
Without a digest check, an upstream change lands in a release build unnoticed.
A mismatch fails the build with the expected and actual digests, and the fix is to review the change and update the recorded value deliberately.

### Extraction

ImageMagick ships `.7z`, which Node cannot read and which the other six do not need.
GitHub's `windows-latest` runner has 7-Zip preinstalled, so the script shells out to `7z x` for that one archive and uses a zip path for the rest.
The script is therefore expected to run on Windows, and says so if invoked elsewhere.

The two ImageMagick complications that the macOS build hit do not recur here.
The Windows portable build is static, so there are no dlopen'd coder modules to locate and relocate, and its configuration XML ships inside the same archive.

### Output layout

```
resources/bin/win32-x64/bin/
  ffmpeg.exe  ffprobe.exe  magick.exe  pandoc.exe
  pdftoppm.exe  pdftotext.exe  pdfimages.exe
  resvg.exe  dasel.exe  potrace.exe
```

This is exactly what `resolveTool` already looks for: `<bundleDir>/win32-x64/bin/<name>.exe`.
No change to `toolchain.ts`.

### Testing the script

Same split as the mac script.
Pure logic is exported and unit-tested in `tests/scripts/vendor-win.test.ts` with no filesystem or network: asset-name selection from a release manifest, the archive-member to destination mapping, and digest comparison including the mismatch failure.
Download and extraction stay inside `main()` and are covered by CI actually running it.

## 3. Packaging

`electron-builder.yml` gains a `win` section.

- `icon: build/icon.ico` - already in the repo; it is the source the mac `.icns` was generated from.
- targets `nsis` and `portable`, x64.
- NSIS is per-user: `oneClick: false`, `perMachine: false`, so installation raises no UAC prompt.

`extraResources` already copies all of `resources/bin`, so `win32-x64` ships with no config change.

Artifacts:

- `Converter-<version>-setup.exe` - installer, Start Menu entry, uninstaller.
- `Converter-<version>-portable.exe` - runs from anywhere, no install.

### Signing

None.
There is no Windows code-signing certificate, so SmartScreen shows an unrecognised-app warning on first run and the user must click through "More info" then "Run anyway".

This is stated plainly in the README next to the existing macOS Gatekeeper note rather than left for the user to discover.
Buying a certificate is out of scope, as notarization was for macOS.

## 4. CI

Two workflows under `.github/workflows/`, both on `windows-latest`.

**`ci.yml`** - on pull request and on push to master.
Runs `npm ci`, `npm run vendor:win`, `npm run build`, `npm test`, then `electron-builder --win --dir` and the packaged integration test.
This is what catches Windows breakage without cutting a tag.

**`release.yml`** - on `v*` tag push and on `workflow_dispatch`.
Same steps, then a full `electron-builder --win --publish always`, which creates the GitHub Release and attaches both `.exe` files.

Downloaded archives are cached keyed on the SHA-256 values in `SOURCES`, so a run that changes no pins does not re-download roughly 500 MB.
The cache key changing is the same signal as the digest changing, which keeps the two from drifting apart.

`package.json` gains `vendor:win` alongside the existing `vendor` script, and a `dist:win` script for the electron-builder invocation.

## 5. Packaged test

`tests/integration/packaged.test.ts` currently hardcodes `release/mac-arm64/Converter.app` and its `Contents/Resources/bin` path.
It becomes parameterized over platform, selecting `release/win-unpacked/resources/bin` on Windows, and keeps its existing `skipIf` behaviour when no build is present.

Both assertions carry over unchanged in intent:

1. Every resolved tool path lives inside the packaged tree, which is what proves the app does not depend on tools installed on the host.
2. Real conversions run and their outputs are verified by magic bytes and content, not by exit code.

### The honesty note gets stronger, not weaker

The existing note is explicit that the mac test runs on a machine that has Homebrew, so a pass does not prove the app works without it, and that no clean Mac was available to check.

On Windows that caveat mostly lifts.
A GitHub `windows-latest` runner is a fresh machine that never had ImageMagick, ffmpeg, poppler, resvg, dasel or potrace installed by hand.
A pass there is real evidence of self-containment.

Two honest limits remain and belong in the note.
Pandoc is preinstalled on GitHub's Windows runners, so for that one tool the assertion that the resolved path lives inside the bundle is doing all the work and the "clean machine" argument does not apply.
And no automated test on any platform checks what the window looks like, so the chrome change in section 1 is verified by a human or not at all.

## 6. Verification before release

Automated, in CI: build succeeds, unit tests pass, packaged test proves bundled-only conversion on a clean Windows machine.

Manual, once, before announcing a release: install or run the artifact on a real Windows desktop and confirm the window has a normal title bar, can be moved and resized, and that a drag-and-drop conversion completes.
CI cannot see any of that.

## Out of scope

- Windows arm64.
- Code signing and any SmartScreen reputation work.
- Auto-update. `electron-builder` writes a `latest.yml` as a side effect of publishing; nothing consumes it and no updater is wired up.
- Moving the macOS build into CI.
- Linux, which `isSupportedPlatform` already excludes deliberately.
