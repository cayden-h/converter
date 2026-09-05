import { app, BrowserWindow, ipcMain, shell, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./engine";
import { enforceOffline } from "./offline";
import { forwardProgress } from "./progress";
import { KNOWN_TOOLS, type ToolName } from "./engine/toolchain";
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
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
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

  ipcMain.handle(IPC.detectTools, () =>
    (Object.keys(KNOWN_TOOLS) as ToolName[]).map((name) => ({
      name,
      available: Boolean(engine.toolchain[name]),
      path: engine.toolchain[name],
    })),
  );

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

  forwardProgress(engine.runner, () => mainWindow);

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
