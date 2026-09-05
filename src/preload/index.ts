import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC, type ConvertRequest, type ConverterApi, type ProgressUpdate } from "../shared/ipc";

const api: ConverterApi = {
  detectTools: () => ipcRenderer.invoke(IPC.detectTools),
  outputsFor: (extension: string) => ipcRenderer.invoke(IPC.outputsFor, extension),
  groupedOutputsFor: (extension: string) => ipcRenderer.invoke(IPC.groupedOutputsFor, extension),
  run: (items: ConvertRequest[]) => ipcRenderer.invoke(IPC.run, items),
  cancel: () => ipcRenderer.invoke(IPC.cancel),
  reveal: (target: string) => ipcRenderer.invoke(IPC.reveal, target),
  openPath: (target: string) => ipcRenderer.invoke(IPC.openPath, target),
  openFiles: () => ipcRenderer.invoke(IPC.openFiles),
  onProgress: (handler: (update: ProgressUpdate) => void) => {
    const listener = (_event: unknown, update: ProgressUpdate) => handler(update);
    ipcRenderer.on(IPC.progress, listener);
    return () => {
      ipcRenderer.removeListener(IPC.progress, listener);
    };
  },
  // `as never` avoids needing the DOM `File` type here: this file compiles
  // under the node tsconfig project, which deliberately has no DOM lib.
  pathForFile: (file: unknown) => webUtils.getPathForFile(file as never),
};

contextBridge.exposeInMainWorld("converter", api);
