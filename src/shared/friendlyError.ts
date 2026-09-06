/**
 * Turns a converter's raw failure into something worth showing a person.
 *
 * The tools underneath report failures as terminal output: full command lines,
 * absolute paths, and references to their own C source files. A corrupt PNG
 * currently surfaces as
 *
 *   "error: Error: Command failed: /Users/.../magick /private/tmp/.../a.png ...
 *    magick: improper image header `/private/tmp/.../a.png' @ error/png.c/ReadPNGImage/3956."
 *
 * which tells someone converting a holiday photo nothing they can act on.
 *
 * Each rule maps a recognisable failure to a sentence that says what happened
 * and, where there is one, what to do about it. The raw text is always kept as
 * `detail` so nothing is lost - the UI shows it behind a disclosure.
 */
export interface FriendlyError {
  /** One sentence, plain language, safe to show as the primary message. */
  message: string;
  /** The original text, for a "show details" affordance. */
  detail: string;
}

export interface ErrorContext {
  /** Input extension, already normalized, e.g. "png". */
  from: string;
  /** Requested output, e.g. "jpg". */
  to: string;
}

interface Rule {
  match: RegExp;
  message: (context: ErrorContext) => string;
}

const RULES: Rule[] = [
  {
    match: /^Cancelled$/i,
    message: () => "Cancelled.",
  },
  {
    match: /No converter available/i,
    message: ({ from, to }) => `Converting ${from.toUpperCase()} to ${to.toUpperCase()} is not supported.`,
  },
  {
    match: /Tool not available: (\S+)/i,
    message: () => "A tool this conversion needs is missing from the app. Please report this.",
  },
  {
    match: /Tool path must be absolute/i,
    message: () => "A tool this conversion needs was not found where the app expected it. Please report this.",
  },
  {
    match: /Timed out after/i,
    message: () => "This took too long and was stopped. Very large files can exceed the time limit.",
  },
  {
    match: /no output was written/i,
    message: ({ from, to }) =>
      `The converter finished without producing a file. ${from.toUpperCase()} to ${to.toUpperCase()} may not be supported for this particular file.`,
  },
  {
    // ImageMagick: improper image header / no decode delegate / unable to open
    match: /improper image header|no decode delegate|unable to open image|corrupt image/i,
    message: ({ from }) =>
      `This does not look like a valid ${from.toUpperCase()} file. It may be corrupt, or renamed from a different format.`,
  },
  {
    // ffmpeg's equivalent
    match: /Invalid data found when processing input|moov atom not found/i,
    message: ({ from }) =>
      `This file appears to be corrupt or incomplete, so it could not be read as ${from.toUpperCase()}.`,
  },
  {
    match: /does not contain any stream|Output file is empty/i,
    message: ({ to }) =>
      `There is nothing in this file to convert to ${to.toUpperCase()}. A video with no audio track cannot become an audio file, for example.`,
  },
  {
    match: /maxBuffer|stdout maxBuffer length exceeded/i,
    message: () => "This file is too large for the converter to handle in one pass.",
  },
  {
    match: /ENOSPC|No space left/i,
    message: () => "There is not enough free disk space to write the converted file.",
  },
  {
    match: /EACCES|Permission denied|not permitted/i,
    message: () =>
      "The app is not allowed to write to that folder. Try moving the file somewhere like Documents or Desktop.",
  },
  {
    match: /ENOENT|no such file or directory/i,
    message: () => "The file could not be found. It may have been moved, renamed, or deleted.",
  },
  {
    match: /EISDIR/i,
    message: () => "That is a folder, not a file.",
  },
  {
    // Catch-all for a tool that exited non-zero without a recognised reason.
    match: /Command failed|exited with code|signal SIG/i,
    message: ({ from, to }) =>
      `The converter could not turn this ${from.toUpperCase()} into ${to.toUpperCase()}. The file may be unusual or unsupported.`,
  },
];

/** First line of the raw text, trimmed, as a last-resort message. */
function firstLine(raw: string): string {
  const line = raw.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.replace(/^error:\s*/i, "").replace(/^Error:\s*/, "");
}

export function friendlyError(raw: string, context: ErrorContext): FriendlyError {
  const detail = raw.trim();
  for (const rule of RULES) {
    if (rule.match.test(detail)) {
      return { message: rule.message(context), detail };
    }
  }
  const fallback = firstLine(detail);
  return {
    message: fallback.length > 0 && fallback.length <= 160 ? fallback : "The conversion failed.",
    detail,
  };
}
