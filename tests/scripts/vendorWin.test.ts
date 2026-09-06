import { describe, expect, test } from "vitest";
import {
  SOURCES,
  assertDigest,
  destinationFor,
  missingMembers,
  type WindowsSource,
} from "../../scripts/vendor-binaries-win";

const fixture: WindowsSource = {
  name: "poppler",
  url: "https://example.test/Release-26.07.0-0.zip",
  sha256: "aa".repeat(32),
  archive: "zip",
  members: {
    "pdftoppm.exe": "pdftoppm.exe",
    "pdftotext.exe": "pdftotext.exe",
    "pdfimages.exe": "pdfimages.exe",
  },
};

describe("destinationFor", () => {
  test("matches an archive member by basename, ignoring its directories", () => {
    // Every one of these archives nests its executables under a versioned
    // top-level directory (poppler-24.08.0/Library/bin/...). Matching on the
    // full path would break on every upstream version bump.
    expect(destinationFor(fixture, "poppler-26.07.0/Library/bin/pdftoppm.exe")).toBe("pdftoppm.exe");
  });

  test("matches case-insensitively", () => {
    // Zip entries from Windows tooling are not consistently cased.
    expect(destinationFor(fixture, "poppler/bin/PDFTOTEXT.EXE")).toBe("pdftotext.exe");
  });

  test("ignores a member we did not ask for", () => {
    // These archives carry dozens of extra executables and DLLs. Copying
    // everything would bloat the installer with tools the app never calls.
    expect(destinationFor(fixture, "poppler/bin/pdfunite.exe")).toBeNull();
  });

  test("does not match a substring of a member name", () => {
    // "notpdftoppm.exe" must not satisfy the "pdftoppm.exe" member.
    expect(destinationFor(fixture, "poppler/bin/notpdftoppm.exe")).toBeNull();
  });
});

describe("missingMembers", () => {
  test("reports nothing when every member was found", () => {
    expect(
      missingMembers(fixture, ["a/pdftoppm.exe", "a/pdftotext.exe", "a/pdfimages.exe", "a/README"]),
    ).toEqual([]);
  });

  test("reports a member the archive did not contain", () => {
    // This is the real failure this guards: upstream reshuffles an archive,
    // extraction still "succeeds", and the app ships missing a tool that
    // then fails at conversion time in front of a user.
    expect(missingMembers(fixture, ["a/pdftoppm.exe", "a/pdftotext.exe"])).toEqual(["pdfimages.exe"]);
  });
});

describe("assertDigest", () => {
  test("accepts a matching digest regardless of case", () => {
    expect(() => assertDigest("ffff", "FFFF", "ffmpeg")).not.toThrow();
  });

  test("throws naming the tool and both digests", () => {
    // The message has to carry the actual digest, because the recovery is to
    // review the upstream change and paste the new value into SOURCES.
    expect(() => assertDigest("aaaa", "bbbb", "ffmpeg")).toThrow(/ffmpeg/);
    expect(() => assertDigest("aaaa", "bbbb", "ffmpeg")).toThrow(/aaaa/);
    expect(() => assertDigest("aaaa", "bbbb", "ffmpeg")).toThrow(/bbbb/);
  });
});

describe("SOURCES", () => {
  test("covers exactly the ten executables toolchain.ts resolves", () => {
    // KNOWN_TOOLS lists eight tools, but poppler is a suite of three
    // executables, so the bundle must contain ten. Non-executable members
    // (ImageMagick's configuration) are filtered out here and asserted
    // separately below.
    const produced = SOURCES.flatMap((source) => Object.values(source.members))
      .filter((destination) => destination.endsWith(".exe"))
      .sort();
    expect(produced).toEqual(
      [
        "dasel.exe",
        "ffmpeg.exe",
        "ffprobe.exe",
        "magick.exe",
        "pandoc.exe",
        "pdfimages.exe",
        "pdftoppm.exe",
        "pdftotext.exe",
        "potrace.exe",
        "resvg.exe",
      ].sort(),
    );
  });

  test("imagemagick carries its configuration, not just the binary", () => {
    // The portable archive is flat: magick.exe sits beside the XML that
    // ImageMagick reads from its own directory. An earlier version of this
    // table took only the .exe, which would have shipped a magick with no
    // delegate definitions, no font list and no MIME table.
    const imagemagick = SOURCES.find((source) => source.name === "imagemagick");
    const members = Object.values(imagemagick?.members ?? {});
    expect(members).toContain("delegates.xml");
    expect(members).toContain("type.xml");
    expect(members).toContain("policy.xml");
    expect(members).toContain("mime.xml");
  });

  test("every source is pinned to a concrete digest", () => {
    // An empty digest means someone ran `npm run digests:win` and never
    // pasted the result back. That would ship an unverified download.
    for (const source of SOURCES) {
      expect(source.sha256, `${source.name} has no recorded digest`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("a raw source declares exactly one member", () => {
    // main()'s raw branch takes Object.values(members)[0] as the destination.
    // More than one entry would silently drop the rest; zero would throw only
    // once someone ran the vendoring on an actual Windows machine.
    for (const source of SOURCES.filter((candidate) => candidate.archive === "raw")) {
      expect(Object.keys(source.members), `${source.name} is raw`).toHaveLength(1);
    }
  });

  test("resvg stays pinned to a release that ships a Windows asset", () => {
    // resvg v0.48.0 and v0.48.1 publish macOS assets ONLY. v0.47.0 is the
    // most recent release with resvg-win64.zip. Bumping this forward without
    // checking the asset list produces a build that silently loses SVG
    // conversion, so the constraint is asserted rather than left in a comment.
    const resvg = SOURCES.find((source) => source.name === "resvg");
    expect(resvg?.url).toContain("v0.47.0");
  });
});
