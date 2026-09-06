import type { ConverterApi, ProgressUpdate } from "../shared/ipc";

declare global {
  interface Window {
    converter: ConverterApi;
  }
}

export type { ProgressUpdate };
export {};
