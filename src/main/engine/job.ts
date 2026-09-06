import { EventEmitter } from "node:events";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { createExecFile, nodeSpawn, type CommandMap } from "./exec";
import { normalizeFiletype, normalizeOutputFiletype } from "./normalizeFiletype";
import type { Registry } from "./registry";
import type { ExecFileFn } from "./types";

export interface JobItem {
  path: string;
  output: string;
}

export interface JobResult {
  path: string;
  ok: boolean;
  outputPath?: string;
  error?: string;
}

export interface ProgressEvent {
  path: string;
  status: "running" | "done" | "failed";
  error?: string;
}

export interface JobRunnerOptions {
  commands: CommandMap;
  outputDirFor: (inputPath: string) => string;
  concurrency?: number;
  timeoutMs?: number;
  /** Injectable for tests. Defaults to the real child_process adapter. */
  spawn?: ExecFileFn;
  /** Injectable for tests. Defaults to a real filesystem check. */
  outputExists?: (outputPath: string) => boolean;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * A converter resolving successfully is not proof it wrote anything.
 * ImageMagick exits 0 when a delegate fails, producing no file at all.
 */
function outputWasWritten(outputPath: string): boolean {
  return existsSync(outputPath) && statSync(outputPath).size > 0;
}

export class JobRunner extends EventEmitter {
  constructor(
    private readonly registry: Registry,
    /** Public and replaceable so tests can redirect output without reaching into privates. */
    public options: JobRunnerOptions,
  ) {
    super();
  }

  async run(items: JobItem[]): Promise<JobResult[]> {
    const concurrency = this.options.concurrency ?? DEFAULT_CONCURRENCY;
    const results = new Array<JobResult>(items.length);
    const claimed = new Set<string>();
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        const item = items[index]!;
        results[index] = await this.runOne(item, claimed);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
    return results;
  }

  /**
   * Two inputs in one batch can map to the same output name (a.png and a.jpeg
   * both become a.jpg). Without this, one silently overwrites the other while
   * both report success. Collisions are resolved within the batch only; an
   * existing file on disk from an earlier run is still overwritten.
   */
  private claimOutputPath(
    directory: string,
    base: string,
    extension: string,
    claimed: Set<string>,
  ): string {
    let candidate = path.join(directory, `${base}.${extension}`);
    let suffix = 1;
    while (claimed.has(candidate)) {
      candidate = path.join(directory, `${base}-${suffix}.${extension}`);
      suffix += 1;
    }
    claimed.add(candidate);
    return candidate;
  }

  private async runOne(item: JobItem, claimed: Set<string>): Promise<JobResult> {
    const inputType = normalizeFiletype(path.extname(item.path).slice(1));
    const converter = this.registry.converterFor(inputType, item.output);

    if (!converter) {
      const error = `No converter available for ${inputType} to ${item.output}`;
      this.emit("progress", { path: item.path, status: "failed", error } as ProgressEvent);
      return { path: item.path, ok: false, error };
    }

    const extension = normalizeOutputFiletype(item.output);
    const base = path.basename(item.path, path.extname(item.path));
    const outputPath = this.claimOutputPath(
      this.options.outputDirFor(item.path),
      base,
      extension,
      claimed,
    );

    this.emit("progress", { path: item.path, status: "running" } as ProgressEvent);

    // Track spawned children so a timeout can actually kill them. Promise.race
    // abandons the losing promise but never cancels the work behind it, so
    // without this the child keeps running and can write its output after the
    // job has already been reported as failed.
    const children = new Set<ChildProcess>();
    const baseSpawn = this.options.spawn ?? nodeSpawn;
    const execFile = createExecFile(this.options.commands, (cmd, args, cb, opts) => {
      const child = baseSpawn(cmd, args, cb, opts) as ChildProcess | undefined;
      if (child) {
        children.add(child);
        child.on("close", () => children.delete(child));
      }
      return child;
    });

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        for (const child of children) child.kill("SIGKILL");
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      await Promise.race([
        converter.convert(item.path, inputType, item.output, outputPath, {}, execFile),
        timeout,
      ]);

      const exists = this.options.outputExists ?? outputWasWritten;
      if (!exists(outputPath)) {
        const error = `Converter reported success but no output was written to ${outputPath}`;
        this.emit("progress", { path: item.path, status: "failed", error } as ProgressEvent);
        return { path: item.path, ok: false, error };
      }

      this.emit("progress", { path: item.path, status: "done" } as ProgressEvent);
      return { path: item.path, ok: true, outputPath };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      this.emit("progress", { path: item.path, status: "failed", error } as ProgressEvent);
      return { path: item.path, ok: false, error };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
