import { app, BrowserWindow } from "electron";

app.whenReady().then(() => {
  new BrowserWindow({ width: 900, height: 640 });
});
