import { describe, expect, test } from "vitest";
import { friendlyError } from "../../src/shared/friendlyError";

const ctx = { from: "png", to: "jpg" };

describe("friendlyError", () => {
  test("never leaks a command line into the message", () => {
    // The failure mode this exists to prevent: a person converting a photo
    // sees a full absolute path and a reference to png.c line 3956.
    const raw =
      "error: Error: Command failed: /Users/x/app/bin/magick /tmp/a.png -auto-orient /tmp/a.jpg\n" +
      "magick: improper image header `/tmp/a.png' @ error/png.c/ReadPNGImage/3956.";
    const { message, detail } = friendlyError(raw, ctx);
    expect(message).not.toContain("/Users/");
    expect(message).not.toContain("magick");
    expect(message).not.toContain("png.c");
    expect(message).toMatch(/does not look like a valid PNG/i);
    expect(detail, "the raw text must still be available").toContain("png.c");
  });

  test.each([
    ["Cancelled", /^Cancelled\.$/],
    ["No converter available for png to docx", /not supported/i],
    ["Tool not available: magick", /missing from the app/i],
    ["Timed out after 600000ms", /took too long/i],
    ["Converter reported success but no output was written to /tmp/a.jpg", /without producing a file/i],
    ["magick: no decode delegate for this image format", /not look like a valid/i],
    ["Invalid data found when processing input", /corrupt or incomplete/i],
    ["Output file does not contain any stream", /nothing in this file/i],
    ["stdout maxBuffer length exceeded", /too large/i],
    ["ENOSPC: no space left on device", /disk space/i],
    ["EACCES: permission denied, open '/tmp/a.jpg'", /not allowed to write/i],
    ["ENOENT: no such file or directory", /could not be found/i],
  ])("maps %s to something a person can act on", (raw, expected) => {
    expect(friendlyError(raw, ctx).message).toMatch(expected);
  });

  test("names the actual formats rather than saying 'the file'", () => {
    const { message } = friendlyError("No converter available for heic to docx", {
      from: "heic",
      to: "docx",
    });
    expect(message).toContain("HEIC");
    expect(message).toContain("DOCX");
  });

  test("falls back to the first line when nothing matches", () => {
    const { message } = friendlyError("something entirely unexpected happened", ctx);
    expect(message).toBe("something entirely unexpected happened");
  });

  test("does not use a huge unmatched blob as the message", () => {
    // A wall of text is not a message. Better to say the conversion failed and
    // let the reader open the details.
    const raw = "x".repeat(500);
    expect(friendlyError(raw, ctx).message).toBe("The conversion failed.");
  });

  test("always preserves the raw text as detail", () => {
    for (const raw of ["Cancelled", "ENOENT: no such file", "weird thing"]) {
      expect(friendlyError(raw, ctx).detail).toBe(raw);
    }
  });
});
