import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: resolve("src/main/index.ts") },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
        // A sandboxed preload MUST be CommonJS - Electron only accepts an ESM
        // preload when sandbox is false, and this app deliberately keeps
        // sandbox: true. Because package.json sets "type": "module",
        // electron-vite would otherwise emit index.mjs, which the main process
        // cannot load: the window opens, window.converter is undefined, and
        // the renderer dies on its first bridge call with a blank window.
        output: { format: "cjs", entryFileNames: "[name].js" },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve("src/renderer/index.html") },
    },
  },
});
