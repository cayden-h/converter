export interface ToolStatus {
  name: string;
  available: boolean;
  path?: string;
}

export interface ConvertRequest {
  path: string;
  output: string;
}

export interface ConvertResult {
  path: string;
  ok: boolean;
  outputPath?: string;
  error?: string;
}

export interface FormatGroup {
  medium: string;
  formats: string[];
}

export interface ProgressUpdate {
  path: string;
  status: "running" | "done" | "failed";
  error?: string;
}

export const IPC = {
  detectTools: "converter:detectTools",
  outputsFor: "converter:outputsFor",
  groupedOutputsFor: "converter:groupedOutputsFor",
  run: "converter:run",
  reveal: "converter:reveal",
  progress: "converter:progress",
} as const;

export interface ConverterApi {
  detectTools(): Promise<ToolStatus[]>;
  outputsFor(extension: string): Promise<string[]>;
  groupedOutputsFor(extension: string): Promise<FormatGroup[]>;
  run(items: ConvertRequest[]): Promise<ConvertResult[]>;
  reveal(path: string): Promise<void>;
  /** Subscribe to conversion progress. Returns an unsubscribe function. */
  onProgress(handler: (update: ProgressUpdate) => void): () => void;
  /**
   * Resolves a dropped File to its absolute path.
   *
   * Electron 32 REMOVED `File.path`, so a renderer cannot read it directly any
   * more; `webUtils.getPathForFile` in the preload is the replacement. Typed as
   * `unknown` rather than `File` because this file compiles under both the node
   * and web tsconfig projects, and the node project has no DOM lib.
   */
  pathForFile(file: unknown): string;
}
