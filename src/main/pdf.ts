import { BrowserWindow } from "electron";
import { pathToFileURL } from "node:url";

/**
 * Renders a local HTML file to PDF in an offscreen window.
 *
 * The offscreen window is covered by the same offline guard as the main one,
 * so a document referencing a remote stylesheet or image renders without it
 * rather than reaching the network.
 */
export async function renderPdf(htmlPath: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false },
  });
  try {
    await window.loadURL(pathToFileURL(htmlPath).toString());
    return await window.webContents.printToPDF({ printBackground: true });
  } finally {
    window.destroy();
  }
}
