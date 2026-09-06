import path from "node:path";
import { describe, expect, test } from "vitest";
import { createExecFile, toCommandMap, nodeSpawn, toFfmpegExecFile } from "../../src/main/engine/exec";

describe("createExecFile", () => {
  test("rewrites a bare command name to the resolved absolute path", () => {
    let seenCmd = "";
    const spawn = (cmd: string, _args: string[], cb: (e: null, o: string, s: string) => void) => {
      seenCmd = cmd;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/opt/homebrew/bin/magick" }, spawn);
    execFile("magick", ["a.png", "b.jpg"], () => {});
    expect(seenCmd).toBe("/opt/homebrew/bin/magick");
  });

  test("passes arguments through untouched", () => {
    let seenArgs: string[] = [];
    const spawn = (_c: string, args: string[], cb: (e: null, o: string, s: string) => void) => {
      seenArgs = args;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", ["-auto-orient", "in.png", "out.jpg"], () => {});
    expect(seenArgs).toEqual(["-auto-orient", "in.png", "out.jpg"]);
  });

  test("errors when the command is not in the resolved map", async () => {
    const spawn = (_c: string, _a: string[], cb: (e: null, o: string, s: string) => void) =>
      cb(null, "", "");
    const execFile = createExecFile({}, spawn);
    const err = await new Promise<Error | null>((resolve) => {
      execFile("magick", [], (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("magick");
  });

  test("strips shell:true when a caller actually passes it", () => {
    // The caller MUST pass { shell: true } as the 4th argument. An earlier
    // version of this test never passed options at all, so `safeOptions` was
    // always {} and the assertion held even with the `delete` removed. A test
    // that cannot fail is worse than no test.
    let seenOptions: unknown;
    const spawn = (
      _c: string,
      _a: string[],
      cb: (e: null, o: string, s: string) => void,
      opts?: unknown,
    ) => {
      seenOptions = opts;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", [], () => {}, { shell: true } as never);
    expect(seenOptions).toBeDefined();
    expect((seenOptions as { shell?: unknown }).shell).toBeUndefined();
  });

  test("preserves other options while stripping shell", () => {
    let seenOptions: Record<string, unknown> | undefined;
    const spawn = (
      _c: string,
      _a: string[],
      cb: (e: null, o: string, s: string) => void,
      opts?: unknown,
    ) => {
      seenOptions = opts as Record<string, unknown>;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", [], () => {}, { shell: true, maxBuffer: 4096 } as never);
    expect(seenOptions?.maxBuffer).toBe(4096);
    expect(seenOptions?.shell).toBeUndefined();
  });

  test("reports a missing tool asynchronously, never in the same tick", async () => {
    // Real child_process.execFile always calls back on a later tick. If the
    // missing-tool path called back synchronously, consumers would see
    // different ordering depending on whether a tool happened to exist.
    const execFile = createExecFile({});
    const order: string[] = [];
    await new Promise<void>((resolve) => {
      execFile("magick", [], (err) => {
        order.push(err ? "callback" : "unexpected-success");
        resolve();
      });
      order.push("after-call");
    });
    expect(order).toEqual(["after-call", "callback"]);
  });

  test("rejects a relative resolved path rather than trusting cwd", async () => {
    // toolchain.ts is supposed to only ever produce absolute paths. If a
    // relative one leaks through, Node resolves it against cwd, which is a
    // silent, cwd-dependent failure. Fail loudly instead.
    //
    // This failure also goes through the async path (Defect 2's fix), so this
    // assertion must await the callback via a Promise rather than reading
    // `err` synchronously right after calling execFile.
    const execFile = createExecFile({ magick: "bin/magick" });
    const err = await new Promise<Error | null>((resolve) => {
      execFile("magick", [], (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("absolute");
  });

  test("strips encoding:buffer so the string callback contract holds", () => {
    // Node picks Buffer vs string from options.encoding at runtime, so no type
    // assertion can keep this honest. It has to be enforced here.
    let seenOptions: Record<string, unknown> | undefined;
    const spawn = (
      _c: string,
      _a: string[],
      cb: (e: null, o: string, s: string) => void,
      opts?: unknown,
    ) => {
      seenOptions = opts as Record<string, unknown>;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", [], () => {}, { encoding: "buffer" } as never);
    expect(seenOptions?.encoding).toBeUndefined();
  });

  test("preserves a legitimate encoding", () => {
    let seenOptions: Record<string, unknown> | undefined;
    const spawn = (
      _c: string,
      _a: string[],
      cb: (e: null, o: string, s: string) => void,
      opts?: unknown,
    ) => {
      seenOptions = opts as Record<string, unknown>;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);
    execFile("magick", [], () => {}, { encoding: "utf8" } as never);
    expect(seenOptions?.encoding).toBe("utf8");
  });

  test("applies a generous default maxBuffer that a caller can still override", () => {
    // Lifted converters never set options, so without a default they inherit
    // node's 1MB limit and large conversions fail as truncated pipes.
    let seenOptions: Record<string, unknown> | undefined;
    const spawn = (
      _c: string,
      _a: string[],
      cb: (e: null, o: string, s: string) => void,
      opts?: unknown,
    ) => {
      seenOptions = opts as Record<string, unknown>;
      cb(null, "", "");
    };
    const execFile = createExecFile({ magick: "/bin/magick" }, spawn);

    execFile("magick", [], () => {});
    expect(seenOptions?.maxBuffer).toBe(64 * 1024 * 1024);

    execFile("magick", [], () => {}, { maxBuffer: 123 } as never);
    expect(seenOptions?.maxBuffer).toBe(123);
  });
});

describe("toCommandMap", () => {
  test("rekeys from tool name to the binary name converters actually call", () => {
    // The whole point: Toolchain is keyed "imagemagick", but the lifted
    // converter calls execFile("magick", ...). Without this remap the lookup
    // misses and every conversion reports the tool as unavailable.
    const commands = toCommandMap({ imagemagick: "/opt/homebrew/bin/magick" });
    expect(commands).toEqual({ magick: "/opt/homebrew/bin/magick" });
  });

  test("omits tools that did not resolve", () => {
    const commands = toCommandMap({});
    expect(commands).toEqual({});
  });

  test("maps every binary of a suite, not just the primary", () => {
    const commands = toCommandMap({ poppler: "/opt/homebrew/bin/pdftoppm" });
    expect(commands.pdftoppm).toBe("/opt/homebrew/bin/pdftoppm");
    expect(commands.pdftotext).toBe(path.join("/opt/homebrew/bin", "pdftotext"));
  });

  test("round-trips through createExecFile so the wiring is proven end to end", () => {
    // Guards the actual failure mode: passing the un-remapped Toolchain here
    // would make this resolve nothing.
    let seenCmd = "";
    const spawn = (cmd: string, _a: string[], cb: (e: null, o: string, s: string) => void) => {
      seenCmd = cmd;
      cb(null, "", "");
    };
    const execFile = createExecFile(
      toCommandMap({ imagemagick: "/opt/homebrew/bin/magick" }),
      spawn,
    );
    execFile("magick", [], () => {});
    expect(seenCmd).toBe("/opt/homebrew/bin/magick");
  });
});

describe("nodeSpawn (the real child_process adapter)", () => {
  // ExecFileFn is (cmd, args, callback, options) but node's execFile is
  // (file, args, options, callback). Passing our order straight to node makes
  // it read the callback as options and silently drop the real options. Every
  // other test in this file injects a mock spawn, so only a test that actually
  // crosses into node can catch this.
  test.skipIf(process.platform === "win32")(
    "passes options through to node instead of dropping them",
    async () => {
      const err = await new Promise<Error | null>((resolve) => {
        nodeSpawn("/bin/echo", ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], (e) => resolve(e), {
          maxBuffer: 1,
        });
      });
      expect(err).toBeInstanceOf(Error);
      expect(String(err)).toMatch(/maxBuffer/i);
    },
  );

  test.skipIf(process.platform === "win32")("still delivers stdout on success", async () => {
    const stdout = await new Promise<string>((resolve) => {
      nodeSpawn("/bin/echo", ["hello"], (_e, out) => resolve(out));
    });
    expect(stdout.trim()).toBe("hello");
  });
});

describe("toFfmpegExecFile", () => {
  test("reorders arguments and still resolves the absolute path", () => {
    // ffmpeg's converter uses node's real (cmd, args, options, callback)
    // order. Handing it our ExecFileFn directly would put the callback where
    // node expects options, and the options would be silently dropped - the
    // exact bug this project already fixed once.
    let seen: { cmd: string; opts: unknown; calledBack: boolean } = {
      cmd: "",
      opts: undefined,
      calledBack: false,
    };
    const base = createExecFile({ ffmpeg: "/opt/homebrew/bin/ffmpeg" }, (cmd, _a, cb, opts) => {
      seen.cmd = cmd;
      seen.opts = opts;
      cb(null, "", "");
    });
    const ffmpegExec = toFfmpegExecFile(base);
    ffmpegExec("ffmpeg", ["-i", "a.mov", "b.mp4"], { maxBuffer: 999 }, () => {
      seen.calledBack = true;
    });
    expect(seen.cmd).toBe("/opt/homebrew/bin/ffmpeg");
    expect((seen.opts as { maxBuffer?: number }).maxBuffer).toBe(999);
    expect(seen.calledBack).toBe(true);
  });

  test("surfaces a missing tool through the callback", async () => {
    const ffmpegExec = toFfmpegExecFile(createExecFile({}));
    const err = await new Promise<Error | null>((resolve) => {
      ffmpegExec("ffmpeg", [], {}, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("ffmpeg");
  });
});
