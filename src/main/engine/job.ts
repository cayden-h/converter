import { EventEmitter } from "node:events";
import path from "node:path";
import { createExecFile, type CommandMap } from "./exec";
import { normalizeOutputFiletype } from "./normalizeFiletype";
import type { Registry } from "./registry";

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
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

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
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        const item = items[index]!;
        results[index] = await this.runOne(item);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
    return results;
  }

  private async runOne(item: JobItem): Promise<JobResult> {
    const inputType = path.extname(item.path).slice(1);
    const converter = this.registry.converterFor(inputType, item.output);

    if (!converter) {
      const error = `No converter available for ${inputType} to ${item.output}`;
      this.emit("progress", { path: item.path, status: "failed", error } as ProgressEvent);
      return { path: item.path, ok: false, error };
    }

    const extension = normalizeOutputFiletype(item.output);
    const base = path.basename(item.path, path.extname(item.path));
    const outputPath = path.join(this.options.outputDirFor(item.path), `${base}.${extension}`);

    this.emit("progress", { path: item.path, status: "running" } as ProgressEvent);

    const execFile = createExecFile(this.options.commands);
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      await Promise.race([
        converter.convert(item.path, inputType, item.output, outputPath, {}, execFile),
        timeout,
      ]);
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
