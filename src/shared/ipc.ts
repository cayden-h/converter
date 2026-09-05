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
}
