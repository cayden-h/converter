import { describe, expect, test, vi } from "vitest";
import { JobRunner } from "../../src/main/engine/job";
import { buildRegistry } from "../../src/main/engine/registry";

function registryWith(convert: () => Promise<string>) {
  return buildRegistry(
    {
      fake: {
        tools: ["imagemagick"],
        priority: 10,
        // "jpeg" is included alongside "png" so the collision test below can
        // route both a.png and a.jpeg to jpg without an unrelated routing
        // failure masking the collision behavior under test.
        properties: { from: { images: ["png", "jpeg"] }, to: { images: ["jpeg"] } },
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
      outputExists: () => true,
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
      { commands: { magick: "/bin/magick" }, outputDirFor: () => "/out", outputExists: () => true },
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
      outputExists: () => true,
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
      {
        commands: { magick: "/bin/magick" },
        outputDirFor: () => "/out",
        concurrency: 2,
        outputExists: () => true,
      },
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
          tools: ["imagemagick"],
          priority: 10,
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
      outputExists: () => true,
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

  test("does not let two inputs collide onto one output path", async () => {
    // a.png and a.jpeg both convert to a.jpg. Without disambiguation one
    // silently overwrites the other while BOTH report ok.
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    const results = await runner.run([
      { path: "/in/a.png", output: "jpg" },
      { path: "/in/a.jpeg", output: "jpg" },
    ]);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(true);
    expect(results[0]?.outputPath).not.toBe(results[1]?.outputPath);
  });

  test("kills the child process when a conversion times out", async () => {
    let killed = false;
    const fakeChild = {
      kill: () => {
        killed = true;
      },
      on: () => {},
    };
    const registry = buildRegistry(
      {
        fake: {
          tools: ["imagemagick"],
          priority: 10,
          properties: { from: { images: ["png"] }, to: { images: ["jpeg"] } },
          // Never settles, so the timeout always wins the race.
          convert: (_f, _t, _c, _p, _o, execFileOverride) =>
            new Promise<string>(() => {
              execFileOverride?.("magick", [], () => {});
            }),
        },
      },
      { imagemagick: "/bin/magick" },
    );
    const runner = new JobRunner(registry, {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      timeoutMs: 20,
      spawn: () => fakeChild as never,
    });
    const results = await runner.run([{ path: "/in/a.png", output: "jpg" }]);
    expect(results[0]?.ok).toBe(false);
    expect(killed, "timed-out conversion must not leave an orphan process").toBe(true);
  });

  test("hands the converter a normalized file type, not the raw extension", async () => {
    // Lifted converters compare fileType literally (fileType === "svg"), so an
    // uppercase extension would miss its special-case branch.
    let seenType = "";
    const registry = buildRegistry(
      {
        fake: {
          tools: ["imagemagick"],
          priority: 10,
          properties: { from: { images: ["png"] }, to: { images: ["jpeg"] } },
          convert: async (_f, fileType) => {
            seenType = fileType;
            return "Done";
          },
        },
      },
      { imagemagick: "/bin/magick" },
    );
    const runner = new JobRunner(registry, {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    await runner.run([{ path: "/in/PHOTO.PNG", output: "jpg" }]);
    expect(seenType).toBe("png");
  });

  test("fails when the converter claims success but wrote no file", async () => {
    // Real case: `magick in.png out.mp4` exits 0 and writes nothing when its
    // ffmpeg delegate is missing, so the lifted converter resolves "Done".
    // Trusting that would report a Done row with a Reveal button pointing at
    // a file that does not exist.
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
    });
    const results = await runner.run([{ path: "/in/a.png", output: "jpg" }]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toMatch(/no output|not (?:be )?(?:created|written)/i);
  });

  test("names a compound output by its real extension, not the codec prefix", async () => {
    // ffmpeg advertises av1.mp4, h265.mkv and friends: the prefix selects a
    // codec, the suffix is the container. Naming the file from the whole
    // string would produce clip.av1.mp4.
    const registry = buildRegistry(
      {
        fake: {
          tools: ["ffmpeg"],
          priority: 20,
          properties: { from: { video: ["mov"] }, to: { video: ["av1.mp4"] } },
          convert: async () => "Done",
        },
      },
      { ffmpeg: "/bin/ffmpeg" },
    );
    const runner = new JobRunner(registry, {
      commands: { ffmpeg: "/bin/ffmpeg" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    const results = await runner.run([{ path: "/in/clip.mov", output: "av1.mp4" }]);
    expect(results[0]?.ok, results[0]?.error).toBe(true);
    expect(results[0]?.outputPath).toBe("/out/clip.mp4");
  });

  test("passes the full compound format to the converter, not just the container", async () => {
    // The codec prefix is how ffmpeg knows to use libaom-av1. Stripping it
    // before calling convert() would silently produce the default codec.
    let seenConvertTo = "";
    const registry = buildRegistry(
      {
        fake: {
          tools: ["ffmpeg"],
          priority: 20,
          properties: { from: { video: ["mov"] }, to: { video: ["av1.mp4"] } },
          convert: async (_f, _t, convertTo) => {
            seenConvertTo = convertTo;
            return "Done";
          },
        },
      },
      { ffmpeg: "/bin/ffmpeg" },
    );
    const runner = new JobRunner(registry, {
      commands: { ffmpeg: "/bin/ffmpeg" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    await runner.run([{ path: "/in/clip.mov", output: "av1.mp4" }]);
    expect(seenConvertTo).toBe("av1.mp4");
  });

  test("cancel stops queued files from starting", async () => {
    let started = 0;
    const runner = new JobRunner(
      registryWith(async () => {
        started += 1;
        await new Promise((r) => setTimeout(r, 20));
        return "Done";
      }),
      {
        commands: { magick: "/bin/magick" },
        outputDirFor: () => "/out",
        outputExists: () => true,
        concurrency: 1,
      },
    );
    const items = Array.from({ length: 6 }, (_, i) => ({ path: `/in/${i}.png`, output: "jpg" }));
    const running = runner.run(items);
    setTimeout(() => runner.cancel(), 25);
    const results = await running;
    expect(started).toBeLessThan(items.length);
    expect(results.some((r) => !r.ok)).toBe(true);
  });

  test("cancel kills a child process that is already running", async () => {
    let killed = false;
    const fakeChild = { kill: () => { killed = true; }, on: () => {} };
    const registry = buildRegistry(
      {
        fake: {
          tools: ["imagemagick"],
          priority: 10,
          properties: { from: { images: ["png"] }, to: { images: ["jpeg"] } },
          convert: (_f, _t, _c, _p, _o, execFileOverride) =>
            new Promise<string>(() => {
              execFileOverride?.("magick", [], () => {});
            }),
        },
      },
      { imagemagick: "/bin/magick" },
    );
    const runner = new JobRunner(registry, {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      outputExists: () => true,
      spawn: () => fakeChild as never,
    });
    const running = runner.run([{ path: "/in/a.png", output: "jpg" }]);
    setTimeout(() => runner.cancel(), 20);
    await running;
    expect(killed, "an in-flight child must be killed on cancel").toBe(true);
  });

  test("a fresh run after cancel is not still cancelled", async () => {
    const runner = new JobRunner(registryWith(async () => "Done"), {
      commands: { magick: "/bin/magick" },
      outputDirFor: () => "/out",
      outputExists: () => true,
    });
    runner.cancel();
    const results = await runner.run([{ path: "/in/a.png", output: "jpg" }]);
    expect(results[0]?.ok, "cancel must not poison later runs").toBe(true);
  });
});
