import { describe, expect, test } from "vitest";
import { chromeOptionsFor } from "../../src/main/windowOptions";

describe("chromeOptionsFor", () => {
  test("macOS gets the inset title bar and sidebar vibrancy", () => {
    expect(chromeOptionsFor("darwin")).toEqual({
      titleBarStyle: "hiddenInset",
      vibrancy: "sidebar",
    });
  });

  test("Windows gets neither", () => {
    // hiddenInset removes the title bar. The renderer defines no
    // -webkit-app-region: drag region, so on Windows that leaves a window
    // with no title bar AND no draggable area - the user cannot move it.
    expect(chromeOptionsFor("win32")).toEqual({});
  });

  test("an unknown platform gets neither", () => {
    // Fail closed: a platform we have not looked at gets the plain system
    // title bar rather than chrome we have never seen render.
    expect(chromeOptionsFor("linux")).toEqual({});
  });

  test("never returns a key with an undefined value", () => {
    // `{ titleBarStyle: undefined }` is NOT the same as `{}` to Electron on
    // every version - spreading an explicit undefined can override a default.
    // Assert the keys are absent, not merely falsy.
    expect(Object.keys(chromeOptionsFor("win32"))).toEqual([]);
  });
});
