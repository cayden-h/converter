import type { BrowserWindow } from "electron";
import type { JobRunner, ProgressEvent } from "./engine/job";
import { IPC } from "../shared/ipc";

/**
 * Forwards the runner's progress events to the renderer.
 *
 * The window can be closed mid-batch, and sending to destroyed webContents
 * throws - which inside an EventEmitter handler would surface as an unhandled
 * error and take down the conversion. Guard every send.
 */
export function forwardProgress(
  runner: JobRunner,
  getWindow: () => BrowserWindow | null,
): void {
  runner.on("progress", (event: ProgressEvent) => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(IPC.progress, event);
  });
}
