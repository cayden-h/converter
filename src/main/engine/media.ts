/**
 * Which medium a file format belongs to, for grouping the output picker.
 *
 * This classification is OURS, not upstream's. ConvertX's converters group
 * their format tables by whatever suited the tool: ImageMagick files every
 * format it knows - including mp4 - under "images", and ffmpeg files
 * everything under "muxer". Grouping the picker on those keys would show mp4
 * under Images and every video format under a heading called "muxer".
 *
 * tests/engine/routing.test.ts asserts that the formats people actually
 * convert are all classified, so adding a converter cannot silently dump
 * common formats into "Other".
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
  | "Other";

/** Display order for the picker. "Other" is last: it is a fallback, not a home. */
export const MEDIA_GROUP_ORDER: readonly Medium[] = [
  "Images",
  "Video",
  "Audio",
  "Documents",
  "E-books",
  "Data",
  "Vector",
  "3D",
  "Other",
];

const BY_MEDIUM: Record<Exclude<Medium, "Other">, readonly string[]> = {
  Images: [
    "jpg", "jpeg", "jfif", "png", "apng", "webp", "gif", "bmp", "tiff", "tif",
    "ico", "avif", "heic", "heif", "jxl", "j2k", "jp2", "psd", "xcf", "dds",
    "exr", "hdr", "pbm", "pgm", "ppm", "pnm", "tga", "sgi", "rgb", "pcx",
    "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "raf", "rw2",
  ],
  Video: [
    "mp4", "m4v", "mov", "mkv", "webm", "avi", "flv", "wmv", "mpg", "mpeg",
    "mts", "m2ts", "ts", "3gp", "3g2", "ogv", "vob", "asf", "rm", "rmvb",
    "av1.mp4", "av1.mkv", "h264.mp4", "h264.mkv", "h265.mp4", "h265.mkv",
    "h266.mkv",
  ],
  Audio: [
    "mp3", "wav", "flac", "aac", "ogg", "oga", "opus", "m4a", "wma", "aiff",
    "aif", "alac", "amr", "ac3", "dts", "ape", "wv", "spx", "mka",
  ],
  Documents: [
    "pdf", "txt", "md", "markdown", "html", "htm", "rtf", "tex", "latex",
    "docx", "doc", "odt", "xlsx", "xls", "ods", "pptx", "ppt", "odp",
    "org", "rst", "adoc", "msg", "eml",
  ],
  "E-books": ["epub", "mobi", "azw", "azw3", "fb2", "lit", "pdb", "lrf"],
  Data: ["csv", "tsv", "json", "yaml", "yml", "xml", "toml", "ini", "vcf", "ics"],
  Vector: ["svg", "svgz", "eps", "ai", "emf", "wmf", "cdr", "dxf", "plt"],
  "3D": [
    "obj", "stl", "ply", "fbx", "dae", "gltf", "glb", "3ds", "blend", "x3d",
    "off", "3mf",
  ],
};

const LOOKUP: Map<string, Medium> = new Map();
for (const [medium, formats] of Object.entries(BY_MEDIUM)) {
  for (const format of formats) LOOKUP.set(format, medium as Medium);
}

export function mediumOf(format: string): Medium {
  return LOOKUP.get(format.toLowerCase()) ?? "Other";
}
