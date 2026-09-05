import { execFile as nodeExecFile } from "node:child_process";
import type { ExecFileOptionsWithStringEncoding } from "node:child_process";
import path from "node:path";
import type { ExecFileFn } from "./types";
import { KNOWN_TOOLS, type ToolName, type Toolchain } from "./toolchain";

/** 64MB. Generous enough for image and video tool output; node defaults to 1MB. */
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

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

    const safeOptions: Record<string, unknown> = { ...(options ?? {}) };

    // Never let a command string reach a shell parser.
    delete safeOptions.shell;

    // ExecFileFn's callback is typed for string stdout/stderr, but node decides
    // Buffer-vs-string from options.encoding at RUNTIME. A converter passing
    // "buffer" would hand Buffers to code that declares strings, and no type
    // assertion can prevent that - so enforce the contract at the boundary.
    if (safeOptions.encoding === "buffer") delete safeOptions.encoding;

    // Lifted converters are byte-identical to upstream and never set maxBuffer,
    // so without this they inherit node's 1MB default. ImageMagick and ffmpeg
    // can exceed that on large files, failing in a way that reads as a broken
    // conversion rather than a truncated pipe.
    if (safeOptions.maxBuffer === undefined) safeOptions.maxBuffer = DEFAULT_MAX_BUFFER;

    return spawn(resolved, args, callback, safeOptions as Parameters<ExecFileFn>[3]);
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

/**
 * ffmpeg's lifted converter takes node's real argument order,
 * (cmd, args, options, callback), rather than ExecFileFn's
 * (cmd, args, callback, options). Upstream's own comment explains why: node
 * ignores an options object placed after the callback.
 *
 * This adapts our wrapper to that shape so ffmpeg still gets absolute-path
 * resolution, shell stripping and the maxBuffer default.
 */
export type FfmpegExecFile = (
  cmd: string,
  args: string[],
  options: object,
  callback: (err: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export function toFfmpegExecFile(execFile: ExecFileFn): FfmpegExecFile {
  return (cmd, args, options, callback) => execFile(cmd, args, callback, options as never);
}
