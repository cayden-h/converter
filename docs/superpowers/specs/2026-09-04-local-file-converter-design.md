# Local File Converter - Design

Date: 2026-09-04
Status: Approved

## Problem

Converting a file today means uploading it to an untrusted website.
That is bad for privacy and unreliable.
The goal is a desktop application that converts files locally, works with no network connection, and is pleasant enough to reach for by default.

## Goals

- Double-click an application and convert a file.
- No network access at any point, enforced structurally rather than by convention.
- Works on a fresh machine with zero setup for the common formats.
- The formats people actually convert every day all work out of the box.
- Good enough UI that it beats a website on convenience, not just on privacy.

## Scope

The first build targets macOS on Apple Silicon only.

Windows is a planned follow-up, because this is intended to run on Cayden's Windows machine and on family desktops.
Windows is therefore not a non-goal.
The design must not preclude it, and the Portability section below states the specific constraints that keep the door open.
No Windows-specific work happens in the first build.

Linux is out of scope entirely.

## Non-Goals

- Multi-user support, accounts, or authentication.
- A hosted or shareable service.
- Supporting every format in existence.

## Prior Art and Reuse

Two repositories were evaluated and audited for malware, telemetry, and outbound network calls.
Both were clean.

**C4illin/ConvertX** (AGPL-3.0) is a self-hosted web app that reaches roughly 1000 formats by shelling out to CLI tools.
Its `src/converters/*.ts` modules are cleanly isolated: each exports a `properties` table describing from/to formats and options, plus a `convert(filePath, fileType, convertTo, targetPath, options, execFileOverride)` function.
Only `src/converters/main.ts` is coupled to its server (Elysia and SQLite).
Every converter invokes its tool through `execFile` with an argument array rather than a shell string, which is the injection-safe form.
This is the engine we reuse.

**p2r3/convert** (GPL-2.0) is a fully client-side WASM converter.
Its privacy story is excellent but its format coverage is narrower and its output quality more variable.
It is not used, though its Electron packaging approach validated that path.

Because ConvertX's converters are reused, this project is licensed AGPL-3.0.

## Stack Decision

Electron, not Tauri.

Tauri's backend is Rust, which would require rewriting all 22 converter modules or shipping a Node sidecar.
Electron runs the TypeScript converters natively in its main process.
That preserves direct reuse of ConvertX's engine and keeps the door open to pulling their upstream fixes.

Electron also carries the Windows follow-up for free, and it supplies the HTML-to-PDF engine described below.

## Architecture

Three layers with hard boundaries.

**`main/`** is the Electron main process.
It owns the conversion engine, spawns binaries, and manages temp files.
It is the only layer that touches the filesystem or child processes.

**`preload/`** exposes a narrow `contextBridge` surface and nothing else:
`detectTools()`, `planConversions(files)`, `run(job)`, `cancel(id)`, `reveal(path)`.

**`renderer/`** is a React and Tailwind UI running with `contextIsolation: true`, `nodeIntegration: false`, and sandboxing enabled.

### Engine

`engine/converters/*.ts` are lifted from ConvertX and kept as close to upstream as practical.

`engine/registry.ts` replaces ConvertX's `main.ts`.
At startup it builds a `from -> to -> converter[]` index, filtered to the tools that actually resolved on this machine.

`engine/toolchain.ts` resolves each tool to an absolute path.
It checks the bundled binary directory first, then a per-platform table of known install locations.
It never inherits a shell `PATH` and never uses `shell: true`.

`engine/job.ts` runs a queue with a concurrency cap.
Each job gets its own temp directory, emits progress events, supports cancellation, and cleans up after itself.

### Removed from ConvertX

The Elysia server, SQLite database, JWT and authentication, account management, upload and download routes, every file under `src/pages/`, and all environment-variable configuration.
None of it is meaningful for one person on one machine, and removing it eliminates most of the attack surface.

## Offline Guarantee

The main process installs a session request handler that blocks every non-`file://` scheme outright.
The renderer is loaded from disk.
No auto-updater is included.

This makes the offline property structural rather than a claim about our own code.
Even a dependency that tried to reach the network could not.

The HTML-to-PDF path below uses an offscreen `BrowserWindow`, which is covered by the same block, so it cannot fetch remote assets either.

## Format Coverage

The driving requirement is that the conversions people actually perform every day work with no setup.
The bundle list is chosen to satisfy that list, not to minimize size.

### Must work out of the box

These are treated as acceptance criteria, not aspirations.
Each has an integration test.

- Images: jpg, png, webp, gif, bmp, tiff, ico, avif, and **heic**.
- Video: mp4, mov, mkv, avi, webm, and video to animated gif.
- Audio: mp3, wav, m4a, aac, flac, ogg.
- Vector and raster crossing: svg to png and jpg, png and jpg to svg.
- PDF out: images to pdf, markdown to pdf, html to pdf.
- PDF in: pdf to png and jpg, pdf to text.
- Documents: markdown, html, txt, rtf, epub, and docx **in** (via pandoc).
- Data: csv, json, yaml, xml, toml.

### Bundled tools

Shipped in `resources/bin/<platform>-<arch>/`, with checksums recorded in a manifest.

- **ffmpeg** and **ffprobe** for all video and audio.
- **ImageMagick**, built with the **libheif** and **libaom** delegates so HEIC and AVIF work without a separate install. This is a deliberate deviation from a stock build and is the reason HEIC is not in the detect tier.
- **poppler** (`pdftoppm`, `pdftotext`, `pdfimages`) for reading PDFs. Around 15MB.
- **pandoc** for the document graph.
- **potrace** and **vtracer** for raster to vector.
- **resvg** for SVG rasterization.
- **dasel** for data formats.

Estimated bundle around 320MB.

### The PDF writer

Pandoc has no PDF engine of its own and normally delegates to LaTeX, which is far too large to ship.

Instead, Electron's own `webContents.printToPDF()` is the PDF writer.
Markdown is converted to HTML by pandoc, then rendered to PDF in an offscreen `BrowserWindow`.
HTML to PDF skips the first step.

This costs no additional bundle size, produces better output than wkhtmltopdf, and has no external dependency.
It lives in `engine/converters/electronPdf.ts`, which is our own module rather than a lifted ConvertX one.

### Detected, never bundled

These light up if already installed and are simply absent otherwise.

LibreOffice, Calibre, Inkscape, XeLaTeX, GraphicsMagick, libjxl, assimp, markitdown, and msgconvert.

**The known gap is Office document output.**
Writing `.docx`, `.xlsx`, and `.pptx`, and reading `.xlsx` and `.pptx`, genuinely require LibreOffice.
LibreOffice is around 800MB and does not relocate cleanly into an application bundle, so it stays detected.
Reading `.docx` still works without it, through pandoc.
The Formats panel names this gap explicitly rather than letting the user discover it mid-task.

## Portability

The first build ships macOS arm64 only, but no decision may assume macOS.
Four rules keep the Windows follow-up cheap.

1. **No platform path may appear outside `engine/toolchain.ts`.** All known install locations live in one per-platform table in that file. Nothing else in the codebase names `/opt/homebrew`, `/Applications`, `C:\Program Files`, or any other platform path.
2. **Binaries are addressed by logical name, never by filename.** The toolchain resolves `"ffmpeg"` to the right path, appending `.exe` on Windows. Converter modules only ever ask for the logical name.
3. **All path handling goes through `node:path`.** No string concatenation with separators, and no assumption about case sensitivity.
4. **`resources/bin/` is keyed by `<platform>-<arch>`,** so adding `win32-x64` is a matter of dropping in binaries and extending the manifest, not restructuring.

The packaging config is written with a Windows target present but disabled, so enabling it later is a flag rather than a rewrite.

CI is not set up in the first build.

## User Interface

A single window with a native feel: vibrancy titlebar, system font, and automatic light and dark following the system setting.

The drop zone fills the window.
Files arrive by drag or by the standard open shortcut.

The file list shows each file with its detected type.
A single searchable output-format picker is grouped by medium: Images, Video, Audio, Documents, E-books, Data, 3D, and Vector.
Formats with no route from the current input are greyed out with the reason shown.

Converter options surface only when the chosen format has them, such as ffmpeg quality and codec, or image quality and resize.

Convert produces per-file progress rows, then results with Reveal in Finder and Open actions.

Output defaults to the input file's own folder, with a setting for a fixed output folder.

A Formats panel lists which converters are live and which are missing.
For each missing one it shows the exact install command to copy, and it calls out the Office document gap by name.
This is what keeps the detect-the-rest half honest instead of silently dropping formats.

## Error Handling

A missing tool means its formats are never offered, so a conversion never fails partway for that reason.

A converter exiting non-zero marks only that row as failed, with a viewable tail of stderr.
Other files in the batch keep going.

Each job has a timeout.

Temp directories are removed on job completion and on application quit.
Leftovers from a crash are swept at the next launch.

## Testing

ConvertX's converters accept an `execFileOverride` hook, so argument-construction tests can run against a mock without invoking real binaries.

Unit tests cover registry routing (given a set of available tools, does A to B select the right converter), toolchain resolution, and filetype normalization.

Integration tests run real conversions against a fixture corpus and assert the output is a valid file of the target type.
The corpus covers every entry in the "Must work out of the box" list above, so that list is enforced rather than documented.
HEIC to JPG and markdown to PDF are included specifically because they exercise the two non-stock parts of the toolchain.

An end-to-end Playwright test drives the packaged Electron build through drop, convert, and result.

## Open Items

None blocking implementation.
