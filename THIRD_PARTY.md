# Third-Party Code

## C4illin/ConvertX

Licensed AGPL-3.0. https://github.com/C4illin/ConvertX

Lifted at upstream commit `e94d037a619d501258a8b4330a80dceffc5247c5`.

The following files are copied from ConvertX and kept as close to upstream as
practical so that upstream fixes can be pulled. The only permitted local change
is the relative import path for `ExecFileFn`.

- `src/main/engine/converters/imagemagick.ts` from `src/converters/imagemagick.ts`
- `src/main/engine/converters/ffmpeg.ts` from `src/converters/ffmpeg.ts` (no local change)
- `src/main/engine/normalizeFiletype.ts` from `src/helpers/normalizeFiletype.ts`
- `src/main/engine/types.ts` from `src/converters/types.ts`
- `src/main/engine/converters/pandoc.ts` from `src/converters/pandoc.ts`
- `src/main/engine/converters/resvg.ts` from `src/converters/resvg.ts`
- `src/main/engine/converters/dasel.ts` from `src/converters/dasel.ts`

Because this code is reused, this project is licensed AGPL-3.0-or-later.
