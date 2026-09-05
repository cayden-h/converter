import type { ConverterApi } from "../shared/ipc";

declare global {
  interface Window {
    converter: ConverterApi;
  }
}

export {};
