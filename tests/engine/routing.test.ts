import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { CONVERTERS, MEDIA_INPUTS } from "../../src/main/engine/index";
import { buildRegistry } from "../../src/main/engine/registry";
import { KNOWN_TOOLS, type ToolName, type Toolchain } from "../../src/main/engine/toolchain";
import { properties as imagemagick } from "../../src/main/engine/converters/imagemagick";
import { properties as ffmpeg } from "../../src/main/engine/converters/ffmpeg";
import { mediumOf } from "../../src/main/engine/media";

/**
 * A toolchain in which every known tool is present.
 *
 * Routing is pure logic - which converter wins for a from/to pair - and must
 * not depend on what happens to be installed on the machine running the
 * tests. This test previously built its engine with
 * createEngine("/nonexistent-bundle-dir"), which found no bundled tool and
 * fell back to ToolSpec.systemPaths. On a developer Mac those resolve to real
 * Homebrew binaries, so the registry was fully populated and every assertion
 * passed; on a clean Windows runner nothing resolved, the registry was empty,
 * and all 23 assertions failed. The suite was quietly asserting that Homebrew
 * was installed.
 */
function completeToolchain(): Toolchain {
  const toolchain: Toolchain = {};
  for (const name of Object.keys(KNOWN_TOOLS) as ToolName[]) {
    toolchain[name] = `/fake/bin/${name}`;
  }
  return toolchain;
}

/** Recursively yields .ts/.tsx files under `dir`, skipping node_modules/out. */
function* walk(dir: string): Generator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "out") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      yield full;
    }
  }
}

function flatten(formats: Record<string, string[]>): Set<string> {
  return new Set(Object.values(formats).flat());
}

describe("MEDIA_INPUTS data integrity", () => {
  test("every entry is actually an ffmpeg input", () => {
    // A format ffmpeg cannot READ can never be routed to ffmpeg no matter its
    // priority, so listing it here is dead weight that implies coverage which
    // does not exist. wmv and ts were both dead when this test was written.
    const ffmpegInputs = flatten(ffmpeg.from);
    const dead = [...MEDIA_INPUTS].filter((format) => !ffmpegInputs.has(format));
    expect(dead, `dead MEDIA_INPUTS entries: ${dead.join(", ")}`).toEqual([]);
  });

  test("every contested MP4-family container is claimed for ffmpeg", () => {
    // These share the container family whose ImageMagick delegate is known to
    // fail silently, producing no output file at all. If both converters claim
    // one and it is not in MEDIA_INPUTS, it routes to ImageMagick.
    const contested = [...flatten(ffmpeg.from)].filter((f) => flatten(imagemagick.from).has(f));
    const mp4Family = ["mp4", "m4v", "mov", "3gp", "3g2"].filter((f) => contested.includes(f));
    const unclaimed = mp4Family.filter((f) => !MEDIA_INPUTS.has(f));
    expect(unclaimed, `contested but routed to ImageMagick: ${unclaimed.join(", ")}`).toEqual([]);
  });
});

describe("real routing", () => {
  const registry = buildRegistry(CONVERTERS, completeToolchain());

  test.each([
    ["mp4", "gif", "ffmpeg"],
    ["3g2", "mp4", "ffmpeg"],
    ["mov", "mp4", "ffmpeg"],
    ["wav", "mp3", "ffmpeg"],
    ["png", "jpg", "imagemagick"],
    ["heic", "jpg", "imagemagick"],
    ["gif", "png", "imagemagick"],
    ["pdf", "png", "poppler"],
    ["pdf", "txt", "poppler"],
    ["md", "html", "pandoc"],
    ["md", "pdf", "electronPdf"],
    ["html", "pdf", "electronPdf"],
    ["svg", "png", "resvg"],
    ["png", "svg", "rasterTrace"],
    ["csv", "json", "dasel"],
    ["json", "yaml", "dasel"],
    ["epub", "html", "pandoc"],
  ])("routes %s to %s via %s", (from, to, expected) => {
    expect(registry.converterFor(from, to)?.name).toBe(expected);
  });

  test("every registered converter declares a priority", () => {
    for (const [name, entry] of Object.entries(CONVERTERS)) {
      expect(entry.priority, `${name} must declare a priority`).toBeDefined();
    }
  });

  test("offers every format a real user might plausibly pick", () => {
    // Replaces a ratio test (offerable < half of all) that was a proxy metric.
    // Satisfying the ratio required hiding ~140 formats, which reached past the
    // junk into real ones - mxf, dnxhd, aifc and y4m were all silently lost.
    // Assert the property directly instead of a count.
    const offered = new Set(
      registry.groupedOutputsFor("mp4").flatMap((g) => g.formats),
    );
    const mustOffer = ["mp4", "mkv", "webm", "mov", "gif", "mxf", "y4m", "mp3", "wav", "flac"];
    const missing = mustOffer.filter((f) => !offered.has(f));
    expect(missing, `real formats hidden from the picker: ${missing.join(", ")}`).toEqual([]);
  });

  test("offers no pseudo-format or codec-only name", () => {
    const offered = new Set(
      registry.groupedOutputsFor("png").flatMap((g) => g.formats),
    );
    const mustHide = ["null", "clipboard", "histogram", "info", "mask", "264", "hevc", "png8"];
    const leaked = mustHide.filter((f) => offered.has(f));
    expect(leaked, `junk offered in the picker: ${leaked.join(", ")}`).toEqual([]);
  });
});

describe("format classification coverage", () => {
  test("the common formats a user will actually pick are all classified", () => {
    // "Other" is a safety net, not a destination. If a format people convert
    // every day lands there, the picker shows it under a meaningless heading.
    const common = [
      "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "ico", "avif", "heic",
      "mp4", "mov", "mkv", "webm", "avi",
      "mp3", "wav", "flac", "aac", "ogg", "m4a",
      "pdf", "txt", "md", "html", "docx", "rtf",
      "epub", "mobi",
      "csv", "json", "yaml", "xml",
      "svg", "eps",
    ];
    const unclassified = common.filter((f) => mediumOf(f) === "Other");
    expect(unclassified, `unclassified: ${unclassified.join(", ")}`).toEqual([]);
  });
});

describe("portability rule 1", () => {
  test("no platform path exists outside toolchain.ts", () => {
    // Portability rule 1. A second home for these paths means a Windows port
    // silently misses one. This caught formatsPanel.ts once already.
    const offenders: string[] = [];
    // Built with path.join rather than written as literals: readdirSync does
    // accept forward slashes on Windows, but joining keeps the walk rooted in
    // the host's own separator so nothing here depends on that leniency.
    const roots = ["main", "renderer", "preload", "shared"].map((dir) => path.join("src", dir));
    const pattern = /\/opt\/homebrew|\/usr\/local\/bin|\/Applications\/|Program Files|\.cargo\/bin/;
    for (const root of roots) {
      for (const file of walk(root)) {
        // path.join gives backslashes on Windows, so a POSIX-shaped endsWith
        // check silently fails there and toolchain.ts reports itself as an
        // offender. Normalize before comparing.
        if (file.split(path.sep).join("/").endsWith("engine/toolchain.ts")) continue;
        if (pattern.test(readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
    expect(offenders, `platform paths outside toolchain.ts: ${offenders.join(", ")}`).toEqual([]);
  });
});
