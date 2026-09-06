<p align="center">
  <img src="build/icon.ico" width="120" alt="Converter">
</p>

<h1 align="center">Converter</h1>

<p align="center">
  A local file converter for macOS. Nothing you convert ever leaves your machine.
</p>

---

## Why

Converting a file usually means uploading it to an unfamiliar website. That is bad for privacy and unreliable. This does the same job locally, in an app you double-click, with no account and no upload.

The offline guarantee is **structural, not a promise**: the Electron main process blocks every request that is not `file://`, so the app cannot reach the network even if a dependency tried to.

## What it converts

| | |
|---|---|
| **Images** | heic, jpg, png, webp, gif, bmp, tiff, ico, avif, psd, dng and ~270 more |
| **Video** | mp4, mov, mkv, webm, avi, and video to animated gif |
| **Audio** | mp3, wav, flac, aac, ogg, opus, m4a, m4b |
| **PDF in** | pdf to png, jpeg, tiff, or plain text |
| **PDF out** | markdown and html to pdf, rendered by Electron's own Chromium |
| **Documents** | markdown, html, rtf, epub, docx (read), txt |
| **Data** | csv, json, yaml, xml, toml |
| **Vector** | svg to png, and png/jpg to real traced svg |

Everything runs from tools bundled inside the app. No Homebrew, no install steps.

**The one gap:** writing `.docx`, `.xlsx` and `.pptx`, and reading `.xlsx` and `.pptx`, need LibreOffice, which is ~800MB and is not bundled. Reading `.docx` works without it, through pandoc. The app's Formats panel says so directly rather than letting you discover it mid-task.

## Install

Download the app, or build it yourself:

```bash
npm install
npm run vendor        # copies the conversion tools and their dylib closure into the app
npm run build
npx electron-builder --mac --dir
open release/mac-arm64/Converter.app
```

The app is **ad-hoc signed**, not notarized, so macOS will block the first launch. Right-click it and choose **Open**, or:

```bash
xattr -dr com.apple.quarantine release/mac-arm64/Converter.app
```

## Development

```bash
npm test          # 239 tests
npm run build     # typecheck both layers, then bundle
```

Use `npm run build && npm start` rather than `npm run dev`. The dev server is served over http, and the offline guard blocks it by design.

## How it works

Three layers with boundaries the compiler enforces:

```
src/main/       Electron main process. Owns the conversion engine.
                The only layer that touches the filesystem or spawns processes.
src/preload/    A narrow contextBridge surface. Nothing else crosses.
src/renderer/   Sandboxed React UI. contextIsolation on, nodeIntegration off.
```

`tsconfig.web.json` sets `"types": []`, so the renderer program has no `@types/node` at all — a renderer file importing `node:fs` is a compile error, not a runtime crash. There is a test that proves it.

The engine picks a converter by scoring each candidate against the **input** format, because ImageMagick and ffmpeg both claim every common still format and a fixed ranking is wrong in either direction: rank ffmpeg above and `png → jpg` degrades; rank it below and `mp4 → gif` routes to a delegate that fails silently.

Conversion tools are resolved to absolute paths, preferring the bundled copy over anything on the system. Nothing inherits a shell `PATH` and `shell: true` is never used.

## Third-party code

Seven converter modules are lifted verbatim from [C4illin/ConvertX](https://github.com/C4illin/ConvertX) (AGPL-3.0) at upstream commit `e94d037`, so upstream fixes stay a `cp` rather than a merge. The only local change permitted to them is one relative import path. See [THIRD_PARTY.md](THIRD_PARTY.md).

Because that code is reused, **this project is AGPL-3.0-or-later**.

Poppler, the composite raster tracer, and the Electron PDF writer are ours — upstream has no equivalent.

## Design and plans

The full design spec and all five implementation plans live in [`docs/superpowers/`](docs/superpowers/). They record the reasoning, not just the outcome — including the things that turned out to be wrong.

A few worth reading if you are extending this:

- **`png → svg` needs two tools.** potrace cannot read PNG, so a composite converter rasterises with ImageMagick then traces, owning its intermediate file.
- **ImageMagick is built from source with `--without-modules`.** Homebrew's build loads every format coder as a separate `.so` from a path compiled in at build time. Those are invisible to `otool -L`, and once relocated the binary could not load them at all — it ran, reported its version correctly, and knew zero formats.
- **A sandboxed preload must be CommonJS.** With `"type": "module"` the bundler emits `.mjs`, the main process cannot load it, and the app opens to a blank window with every test still green.

## Known limitations

- Ad-hoc signed only; opening it on someone else's Mac shows a Gatekeeper warning.
- Windows is structurally ready — paths are keyed `<platform>-<arch>` and live in one file — but no Windows binaries are vendored yet.
- Poppler renders page 1 of a PDF; multi-page output is not wired up.
- `.wmv` has no ffmpeg fallback and `.ts` cannot be converted, both inherited from upstream's format tables.
- Per-converter options (ffmpeg quality, image resize) and a configurable output folder are not built yet.
