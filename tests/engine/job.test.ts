import { describe, expect, test, vi } from "vitest";
import { JobRunner } from "../../src/main/engine/job";
import { buildRegistry } from "../../src/main/engine/registry";

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
