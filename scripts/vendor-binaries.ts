import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * Parses the `CODER_PATH` and `CONFIGURE_PATH` lines out of
 * `magick -list configure`'s output.
 *
 * ImageMagick is built `--with-modules`, so every format coder is a separate
 * `.so` dlopen'd at runtime from a path compiled in at build time, and its
 * XML configuration is read from a second compiled-in path. Neither shows up
 * in `otool -L`, so they must be located and vendored separately from the
 * dylib closure. The version segment in both paths changes with every
 * Homebrew upgrade, so it is parsed here rather than hardcoded.
 */
export function parseConfigurePaths(output: string): { coderPath: string; configurePath: string } {
  const coderMatch = output.match(/^CODER_PATH\s+(.+)$/m);
  const configureMatch = output.match(/^CONFIGURE_PATH\s+(.+)$/m);
  if (!coderMatch || !configureMatch) {
    throw new Error("could not parse CODER_PATH / CONFIGURE_PATH from `magick -list configure`");
  }
  // CONFIGURE_PATH is emitted with a trailing slash; CODER_PATH is not.
  // Normalize both so callers don't need to care.
  return {
    coderPath: coderMatch[1]!.trim().replace(/\/+$/, ""),
    configurePath: configureMatch[1]!.trim().replace(/\/+$/, ""),
  };
}

/**
 * Relocates one ImageMagick coder module in place: makes it writable,
 * rewrites every Homebrew reference to `@executable_path/../lib/<name>`, and
 * ad-hoc signs it. `@executable_path` is correct even though the coder sits
 * two directories below `bin/`, because it resolves relative to the
 * executable that dlopen's the module (`bin/magick`), not to the module
 * itself - `@loader_path` would resolve relative to the `.so` and be wrong.
 */
export function relocateCoderModule(file: string): void {
  chmodSync(file, 0o644 | 0o200);
  const deps = readDepsFrom(file);
  for (const dep of deps) {
    if (shouldRelocate(dep)) {
      execFileSync("install_name_tool", ["-change", dep, rewriteTarget(dep), file]);
    }
  }
  execFileSync("codesign", ["--force", "--sign", "-", file]);
}

export function readDepsFrom(binary: string): string[] {
  const output = execFileSync("otool", ["-L", binary], { encoding: "utf8" });
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0] ?? "")
    .filter((reference) => reference.length > 0);
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main(): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bundleRoot = path.join(repoRoot, "resources", "bin", "darwin-arm64");
  const binDir = path.join(bundleRoot, "bin");
  const libDir = path.join(bundleRoot, "lib");

  rmSync(bundleRoot, { recursive: true, force: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(libDir, { recursive: true });

  // Resolve each tool through `which`, then through realpath - `which` gives
  // a symlink (e.g. Homebrew's Cellar symlinks), and reading dependencies off
  // the symlink walks the wrong file.
  const roots = TOOLS.map((tool) => {
    const resolved = execFileSync("which", [tool], { encoding: "utf8" }).trim();
    return realpathSync(resolved);
  });

  // ImageMagick's coder modules must SEED the closure, not merely be copied
  // afterwards. They are dlopen'd, so `otool -L magick` never mentions them -
  // and crucially each coder has its OWN dependencies that magick itself does
  // not link. Seeding only the executables left libjpeg, libheif, libtiff and
  // the three webp libraries out of the bundle entirely, and ltdl reported the
  // resulting load failure as a misleading "file not found" on the .la file.
  const { coderPath, configurePath } = parseConfigurePaths(
    execFileSync("magick", ["-list", "configure"], { encoding: "utf8" }),
  );
  const coderRoots = existsSync(coderPath)
    ? readdirSync(coderPath)
        .filter((entry) => entry.endsWith(".so"))
        .map((entry) => path.join(coderPath, entry))
    : [];

  const plan = planClosure([...roots, ...coderRoots], (p) => readDepsFrom(realpathSync(p)));

  // The coders live in their own directory, not bin/. They were added only as
  // closure seeds, so drop them before executables get copied.
  plan.executables = plan.executables.filter((file) => !file.endsWith(".so"));

  // Two different otool -L references can resolve to the same physical
  // library through different symlink paths (e.g. /opt/homebrew/lib/x.dylib
  // vs. its Cellar path) - both flatten to the same basename in the bundle,
  // so dedupe by destination path rather than copying the same file twice.
  const destToSource = new Map<string, string>();

  for (const executable of plan.executables) {
    destToSource.set(path.join(binDir, path.basename(executable)), realpathSync(executable));
  }

  const libraryDests = new Set<string>();
  for (const library of plan.libraries) {
    const dest = path.join(libDir, path.basename(library));
    libraryDests.add(dest);
    destToSource.set(dest, realpathSync(library));
  }

  for (const [dest, source] of destToSource) {
    copyFileSync(source, dest);
    chmodSync(dest, 0o755);
  }

  const copiedFiles = [...destToSource.keys()];

  // Relocate references. Every copied file gets its dependency references
  // rewritten; every copied dylib also gets its own install id rewritten so
  // that OTHER copied files which link it by absolute path still resolve it
  // after their own references are rewritten.
  for (const file of copiedFiles) {
    const deps = readDepsFrom(file);
    for (const dep of deps) {
      if (shouldRelocate(dep)) {
        execFileSync("install_name_tool", ["-change", dep, rewriteTarget(dep), file]);
      }
    }
  }

  for (const dest of libraryDests) {
    execFileSync("install_name_tool", ["-id", rewriteTarget(dest), dest]);
  }

  // Re-sign after relocation - install_name_tool invalidates the existing
  // signature, and signing before relocating produces a binary macOS refuses
  // to run.
  for (const file of copiedFiles) {
    execFileSync("codesign", ["--force", "--sign", "-", file]);
  }

  // ImageMagick loads format coders as separate .so modules dlopen'd from a
  // path compiled in at build time, and reads its XML configuration from a
  // second compiled-in path. Neither appears in the dylib closure above, so
  // the bundled magick would otherwise run, report its version correctly,
  // and know zero formats. Locate both paths from the tool itself rather
  // than hardcoding the ImageMagick version, which changes on every
  // Homebrew upgrade.
  const magickBinary = destToSource.has(path.join(binDir, "magick")) ? path.join(binDir, "magick") : undefined;
  let coderCount = 0;
  if (magickBinary) {
    const coderDestDir = path.join(libDir, "ImageMagick", "modules-Q16HDRI", "coders");
    const configureDestDir = path.join(bundleRoot, "etc", "ImageMagick-7");
    mkdirSync(path.dirname(coderDestDir), { recursive: true });
    mkdirSync(path.dirname(configureDestDir), { recursive: true });

    // A non-modular ImageMagick (built --without-modules) compiles every coder
    // into libMagickCore and ships no coders directory at all, even though it
    // still reports a CODER_PATH. Copying is therefore conditional; the
    // configuration XML exists either way.
    if (existsSync(coderPath)) {
      cpSync(coderPath, coderDestDir, { recursive: true });
    }
    if (existsSync(configurePath)) {
      cpSync(configurePath, configureDestDir, { recursive: true });
    }

    const coderFiles = existsSync(coderDestDir)
      ? readdirSync(coderDestDir)
          .filter((name) => name.endsWith(".so"))
          .map((name) => path.join(coderDestDir, name))
      : [];
    for (const coderFile of coderFiles) {
      relocateCoderModule(coderFile);
    }
    coderCount = coderFiles.length;
  }

  const totalBytes = copiedFiles.reduce((sum, file) => sum + statSync(file).size, 0);
  console.log(`Vendored ${copiedFiles.length} files, ${formatBytes(totalBytes)} total.`);
  console.log(`  executables: ${plan.executables.length}`);
  console.log(`  libraries:   ${libraryDests.size}`);
  if (magickBinary) {
    console.log(`  ImageMagick coders: ${coderCount}`);
  }
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
if (isMain) {
  main();
}
