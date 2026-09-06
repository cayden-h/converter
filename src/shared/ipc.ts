export interface ToolStatus {
  name: string;
  available: boolean;
  path?: string;
  /** Copyable command to install this tool when missing, e.g. "brew install ffmpeg". */
  installHint?: string;
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
  cancel: "converter:cancel",
  reveal: "converter:reveal",
  openPath: "converter:openPath",
  progress: "converter:progress",
  openFiles: "converter:openFiles",
} as const;

export interface ConverterApi {
  detectTools(): Promise<ToolStatus[]>;
  outputsFor(extension: string): Promise<string[]>;
  groupedOutputsFor(extension: string): Promise<FormatGroup[]>;
  run(items: ConvertRequest[]): Promise<ConvertResult[]>;
  cancel(): Promise<void>;
  reveal(path: string): Promise<void>;
  /** Opens a file with the OS default application. */
  openPath(path: string): Promise<void>;
  /** Opens the native file picker with multi-selection enabled; resolves to the chosen absolute paths (empty if cancelled). */
  openFiles(): Promise<string[]>;
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
