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
  | "Subtitles"
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
  "Subtitles",
  "Other",
];

const BY_MEDIUM: Record<Exclude<Medium, "Other">, readonly string[]> = {
  Images: [
    "jpg", "jpeg", "jfif", "png", "apng", "webp", "gif", "bmp", "tiff", "tif",
    "ico", "avif", "heic", "heif", "jxl", "j2k", "jp2", "psd", "xcf", "dds",
    "exr", "hdr", "pbm", "pgm", "ppm", "pnm", "tga", "sgi", "rgb", "pcx",
    "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "raf", "rw2",
    "xbm", "xpm", "wbmp", "pict", "pcd", "jng", "miff", "palm", "qoi", "flif",
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
    "org", "rst", "adoc", "msg", "eml", "ps", "pdfa",
  ],
  "E-books": ["epub", "mobi", "azw", "azw3", "fb2", "lit", "pdb", "lrf"],
  Data: ["csv", "tsv", "json", "yaml", "yml", "xml", "toml", "ini", "vcf", "ics"],
  Vector: ["svg", "svgz", "eps", "ai", "emf", "wmf", "cdr", "dxf", "plt", "swf", "mvg", "msvg"],
  "3D": [
    "obj", "stl", "ply", "fbx", "dae", "gltf", "glb", "3ds", "blend", "x3d",
    "off", "3mf",
  ],
  Subtitles: ["srt", "vtt", "ass", "ssa", "sub", "ttml", "sbv", "dfxp", "scc"],
};

const LOOKUP: Map<string, Medium> = new Map();
for (const [medium, formats] of Object.entries(BY_MEDIUM)) {
  for (const format of formats) LOOKUP.set(format, medium as Medium);
}

export function mediumOf(format: string): Medium {
  return LOOKUP.get(format.toLowerCase()) ?? "Other";
}

/**
 * Formats that are reachable but should never appear in the picker.
 *
 * ImageMagick's format table includes pseudo-formats that are not files at all
 * (`null`, `clipboard`, `histogram`), ffmpeg's includes bare codec names that
 * are not containers (`264`, `hevc`), and both include variant spellings of
 * formats already offered under their canonical name (`png8`, `bmp2`, `eps2`).
 *
 * Offering "convert to null" is a bug from the user's point of view. Three
 * quarters of the raw reachable set is this kind of noise.
 */
const NOT_OFFERABLE = new Set([
  "null", "clipboard", "histogram", "info", "mask", "matte", "inline", "data",
  "sparse", "thumbnail", "map", "pal", "icon", "mono", "gray", "graya",
  "cmyk", "cmyka", "rgb", "rgba", "rgbo", "bgr", "bgra", "bgro", "ycbcr",
  "ycbcra", "yuv", "uyvy", "bayer", "bayera", "vid", "strimg", "ashlar",
  "264", "265", "266", "h261", "h263", "hevc", "vc1", "vc2", "obu", "adts",
  "m2v", "a64", "ac4", "302",

  // The rest of the raw ImageMagick/ffmpeg tables not already classified
  // above: bare codec/raw-sample names, professional/broadcast interchange
  // formats nobody hand-picks from a picker, ffmpeg's internal or streaming-
  // manifest formats, and long-obsolete or hardware-specific formats. None
  // of these are something a general user would ever choose as a conversion
  // target - collapsing them is the point of this filter.
  "aai", "adx", "afc", "aifc", "al", "amv", "apm", "aptx", "aptxhd", "art",
  "ast", "au", "aud", "avs", "avs2", "avs3", "bit", "brf", "c2", "caf",
  "cal", "cals", "cavs", "chk", "cin", "cip", "clip", "cpk", "cur", "cvg",
  "dfpwm", "dnxhd", "dnxhr", "dpx", "drc", "dv", "dvd", "dxt1", "dxt5",
  "eac3", "ec3", "epdf", "epi", "evc", "f4v", "farbfeld", "fax", "ff",
  "ffmeta", "fits", "fl32", "flm", "fts", "ftxt", "g3", "g4", "g722",
  "group4", "gsm", "gxf", "hrz", "icb", "im1", "im24", "im8", "ipl",
  "ircam", "isma", "ismv", "isobrl", "isobrl6", "ivf", "j2c", "jls", "jps",
  "js", "jss", "latm", "lbc", "ljpg", "loas", "lrc", "m1v", "m2a", "m2t",
  "m3u8", "m4b", "mat", "mjpeg", "mjpg", "mlp", "mmf", "mng", "mp2", "mpa",
  "mpc", "mpd", "msbc", "msl", "mtv", "mxf", "nut", "oma", "otb", "pam",
  "pcl", "pcm", "pct", "pfm", "pgmyuv", "pgx", "phm", "picon", "pix",
  "pocketmod", "psb", "psp", "ptif", "ra", "ras", "rco", "rcv", "rgf",
  "roq", "rs", "rso", "rsvg", "sb", "sbc", "sf", "shtml", "six", "sixel",
  "sox", "spdif", "sun", "sunras", "sup", "sw", "tco", "thd", "tta", "tun",
  "ub", "ubrl", "ubrl6", "uil", "ul", "uw", "vag", "vbn", "vda", "vicar",
  "viff", "vips", "voc", "vst", "vvc", "w64", "wpg", "wtv", "xface", "xv",
  "xwd", "y", "y4m",
]);

/** Variant spellings whose canonical form is already offered. */
const VARIANT_PATTERN =
  /^(png(00|8|24|32|48|64)|bmp[23]|eps[23]|epsf|epsi|ept[23]?|gif87|ps[23]|tiff64|jpe|pjpeg|jpc|jp[mt]|pcds|dcx)$/;

export function isOfferable(format: string): boolean {
  const key = format.toLowerCase();
  if (NOT_OFFERABLE.has(key)) return false;
  if (VARIANT_PATTERN.test(key)) return false;
  return true;
}
