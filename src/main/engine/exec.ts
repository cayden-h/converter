import { execFile as nodeExecFile } from "node:child_process";
import type { ExecFileOptionsWithStringEncoding } from "node:child_process";
import path from "node:path";
import type { ExecFileFn } from "./types";
import { KNOWN_TOOLS, type ToolName, type Toolchain } from "./toolchain";

/** Maps the bare command name a converter uses to its resolved absolute path. */
export type CommandMap = Record<string, string>;

/**
 * Adapts node's execFile to the ExecFileFn shape.
 *
 * ExecFileFn is (cmd, args, callback, options); node's execFile is
 * (file, args, options, callback). Casting node's function to ExecFileFn
 * instead of adapting it makes node read the callback as the options object
 * and silently discard the real options - so maxBuffer, timeout and cwd would
 * all be ignored in production while every mock-injected test still passed.
 *
 * The options are asserted to the string-encoding overload because ExecFileFn
 * promises the callback string stdout/stderr (never a Buffer), which is only
 * true when node isn't given `encoding: "buffer"` - our options type doesn't
 * narrow that far, so we assert it here rather than widen the shared type.
 */
export const nodeSpawn: ExecFileFn = (cmd, args, callback, options) =>
  nodeExecFile(cmd, args, (options ?? {}) as ExecFileOptionsWithStringEncoding, callback);

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
  spawn: ExecFileFn = nodeSpawn,
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

/**
 * Rekeys a Toolchain (keyed by tool name, e.g. "imagemagick") into a
 * CommandMap (keyed by the bare binary name a lifted converter passes to
 * execFile, e.g. "magick").
 *
 * These two shapes are both Record<string, string>, so skipping this step
 * type-checks and then silently resolves nothing. Always go through here.
 */
export function toCommandMap(toolchain: Toolchain): CommandMap {
  const commands: CommandMap = {};
  for (const [name, resolved] of Object.entries(toolchain)) {
    if (resolved) commands[KNOWN_TOOLS[name as ToolName].binary] = resolved;
  }
  return commands;
}
