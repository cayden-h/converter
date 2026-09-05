/**
 * The medium a format belongs to, and the order groups appear in the picker.
 *
 * This lives in shared/ because BOTH the engine (which classifies formats) and
 * the renderer (which renders the groups) need it, and the renderer cannot
 * import from src/main. Keeping two copies in sync by hand was the alternative,
 * and they would drift silently.
 */
export type Medium =
  | "Images"
  | "Video"
  | "Audio"
  | "Documents"
  | "E-books"
  | "Data"
  | "Vector"
  | "3D"
  | "Subtitles"
  | "Other";

/** Display order. "Other" is last: it is a fallback, not a home. */
export const MEDIA_GROUP_ORDER: readonly Medium[] = [
  "Images",
  "Video",
  "Audio",
  "Documents",
  "E-books",
  "Data",
  "Vector",
  "3D",
  "Subtitles",
  "Other",
];
