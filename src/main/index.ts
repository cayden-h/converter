import { app, BrowserWindow, dialog, ipcMain, shell, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./engine";
import { enforceOffline } from "./offline";
import { forwardProgress } from "./progress";
import { buildToolStatuses } from "./formatsPanel";
import { chromeOptionsFor } from "./windowOptions";
import { IPC, type ConvertRequest } from "../shared/ipc";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = app.isPackaged
  ? path.join(process.resourcesPath, "bin")
  : path.join(dirname, "../../resources/bin");

const engine = createEngine(bundleDir);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    ...chromeOptionsFor(process.platform),
    webPreferences: {
      preload: path.join(dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(dirname, "../renderer/index.html"));
  }

  mainWindow = window;
}

app.whenReady().then(() => {
  enforceOffline(session.defaultSession);

  ipcMain.handle(IPC.detectTools, () => buildToolStatuses(engine.toolchain));

  ipcMain.handle(IPC.outputsFor, (_event, extension: string) =>
    engine.registry.outputsFor(extension),
  );

  ipcMain.handle(IPC.groupedOutputsFor, (_event, extension: string) =>
    engine.registry.groupedOutputsFor(extension),
  );

  ipcMain.handle(IPC.run, (_event, items: ConvertRequest[]) => engine.runner.run(items));

  ipcMain.handle(IPC.cancel, () => {
    engine.runner.cancel();
  });

  ipcMain.handle(IPC.reveal, (_event, target: string) => {
    shell.showItemInFolder(target);
  });

  ipcMain.handle(IPC.openPath, async (_event, target: string) => {
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  });

  ipcMain.handle(IPC.openFiles, async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  forwardProgress(engine.runner, () => mainWindow);

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
