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

export const IPC = {
  detectTools: "converter:detectTools",
  outputsFor: "converter:outputsFor",
  run: "converter:run",
  reveal: "converter:reveal",
} as const;

export interface ConverterApi {
  detectTools(): Promise<ToolStatus[]>;
  outputsFor(extension: string): Promise<string[]>;
  run(items: ConvertRequest[]): Promise<ConvertResult[]>;
  reveal(path: string): Promise<void>;
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
