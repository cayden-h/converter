import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ConvertRequest, type ConverterApi } from "../shared/ipc";

const api: ConverterApi = {
  detectTools: () => ipcRenderer.invoke(IPC.detectTools),
  outputsFor: (extension: string) => ipcRenderer.invoke(IPC.outputsFor, extension),
  run: (items: ConvertRequest[]) => ipcRenderer.invoke(IPC.run, items),
  reveal: (target: string) => ipcRenderer.invoke(IPC.reveal, target),
};

contextBridge.exposeInMainWorld("converter", api);
