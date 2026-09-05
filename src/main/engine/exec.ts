import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";
import type { ExecFileFn } from "./types";

/** Maps the bare command name a converter uses to its resolved absolute path. */
export type CommandMap = Record<string, string>;

/**
 * Builds the ExecFileFn handed to lifted converter modules.
 *
 * Converters call execFile("magick", args, cb) with a bare name. We rewrite it
 * to an absolute path so nothing depends on an inherited PATH, and we always
 * pass an explicit options object with no `shell` key so a command string can
 * never reach a shell parser.
 */
export function createExecFile(
  commands: CommandMap,
  spawn: ExecFileFn = nodeExecFile as ExecFileFn,
): ExecFileFn {
  return (cmd, args, callback, options) => {
    const resolved = commands[cmd];

    // Report failures on a later tick. Real execFile is always async, and a
    // callback that is sometimes sync and sometimes async makes consumer
    // ordering depend on whether a tool happens to be installed.
    const fail = (message: string) => {
      queueMicrotask(() => callback(new Error(message), "", ""));
    };

    if (!resolved) {
      fail(`Tool not available: ${cmd}`);
      return;
    }
    if (!path.isAbsolute(resolved)) {
      fail(`Tool path must be absolute, got: ${resolved}`);
      return;
    }

    const safeOptions = { ...(options ?? {}) };
    delete (safeOptions as { shell?: unknown }).shell;
    return spawn(resolved, args, callback, safeOptions);
  };
}
