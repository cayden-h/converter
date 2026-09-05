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

  test("errors when the command is not in the resolved map", () => {
    const spawn = (_c: string, _a: string[], cb: (e: null, o: string, s: string) => void) =>
      cb(null, "", "");
    const execFile = createExecFile({}, spawn);
    let err: Error | null = null;
    execFile("magick", [], (e) => {
      err = e;
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("magick");
  });

  test("never passes a shell option through", () => {
    let seenOptions: unknown = { shell: true };
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
    execFile("magick", [], () => {});
    expect(seenOptions).toBeDefined();
    expect((seenOptions as { shell?: unknown }).shell).toBeUndefined();
  });
});
