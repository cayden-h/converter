import type { BrowserWindowConstructorOptions } from "electron";

/**
 * The subset of BrowserWindow options that only mean anything on macOS.
 *
 * `titleBarStyle: "hiddenInset"` and `vibrancy` are documented macOS-only.
 * Passing `hiddenInset` on Windows removes the title bar, and because the
 * renderer defines no `-webkit-app-region: drag` region anywhere, the result
 * is a window the user cannot move. So the options are returned as a spread
 * rather than set unconditionally, and every non-darwin platform gets the
 * plain system title bar.
 *
 * This is a `type` import only, so the module stays loadable in a test
 * process that has no Electron runtime.
 */
export type ChromeOptions = Pick<BrowserWindowConstructorOptions, "titleBarStyle" | "vibrancy">;

export function chromeOptionsFor(platform: string): ChromeOptions {
  if (platform !== "darwin") return {};
  return { titleBarStyle: "hiddenInset", vibrancy: "sidebar" };
}
