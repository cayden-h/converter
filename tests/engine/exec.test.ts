import { describe, expect, test } from "vitest";
import { createExecFile } from "../../src/main/engine/exec";

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
});
