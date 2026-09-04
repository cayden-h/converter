# Local File Converter - Design

Date: 2026-09-04
Status: Approved

## Problem

Converting a file today means uploading it to an untrusted website.
That is bad for privacy and unreliable.
The goal is a Mac application that converts files locally, works with no network connection, and is pleasant enough to reach for by default.

## Goals

- Double-click a `.app` in `/Applications` and convert a file.
- No network access at any point, enforced structurally rather than by convention.
- Works on a fresh Mac with zero setup for the common formats.
- Broad format coverage, including video, audio, images, documents, e-books, data, 3D, and vector.
- Good enough UI that it beats a website on convenience, not just on privacy.

## Non-Goals

- Multi-user support, accounts, or authentication.
- A hosted or shareable service.
- Windows or Linux builds.
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
It checks the bundled binary directory first, then known Mac locations such as `/opt/homebrew/bin`, `/Applications/LibreOffice.app/Contents/MacOS/soffice`, and Calibre's `ebook-convert`.
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

## Bundled vs Detected Tools

Bundled in `resources/bin/` as arm64 static binaries, with checksums recorded in a manifest:
ffmpeg and ffprobe, ImageMagick, pandoc, potrace, vtracer, resvg, and dasel.
Roughly 300MB, covering the common majority of conversions with zero setup.

Detected if already installed, never bundled:
LibreOffice, Calibre, Inkscape, XeLaTeX, GraphicsMagick, libheif, libjxl, assimp, markitdown, and msgconvert.
These are either too large to ship (LibreOffice is around 800MB, XeLaTeX over 2GB) or too fragile to relocate into an app bundle.

## User Interface

A single window with a native Mac feel: vibrancy titlebar, system font, and automatic light and dark following the system setting.

The drop zone fills the window.
Files arrive by drag or by Command-O.

The file list shows each file with its detected type.
A single searchable output-format picker is grouped by medium: Images, Video, Audio, Documents, E-books, Data, 3D, and Vector.
Formats with no route from the current input are greyed out with the reason shown.

Converter options surface only when the chosen format has them, such as ffmpeg quality and codec, or image quality and resize.

Convert produces per-file progress rows, then results with Reveal in Finder and Open actions.

Output defaults to the input file's own folder, with a setting for a fixed output folder.

A Formats panel lists which converters are live and which are missing.
For each missing one it shows the exact `brew install` line to copy.
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

Integration tests run real conversions against a small fixture corpus and assert the output is a valid file of the target type:
png to jpg, wav to mp3, mp4 to gif, md to pdf, csv to json, and svg to png.

An end-to-end Playwright test drives the packaged Electron build through drop, convert, and result.

## Open Items

None blocking implementation.
