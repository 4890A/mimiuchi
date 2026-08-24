import path from "node:path";
import { ARCHIVE_EXTS } from "../metadata/types";

/**
 * What a non-audio file in a work folder is.
 *
 * `script` is 台本 — the recording script. It is the one category worth
 * separating by hand, because it is the only one the app can render itself,
 * and because readmes look exactly like it from the outside (both are a lone
 * .txt next to the audio) while being of no interest at all.
 */
export type AssetKind = "script" | "image" | "video" | "text" | "other";

export interface ClassifiedAsset {
  kind: AssetKind;
  /** Basename without its extension, for display. */
  title: string;
  /** Lowercased, with the leading dot. */
  extension: string;
  /** First run of digits in the basename, or null. */
  orderHint: number | null;
}

/** Handled as tracks by the scanner, never as assets. */
const AUDIO_EXTS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wma",
]);

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const VIDEO_EXTS = new Set([".mp4", ".m4v", ".webm", ".mkv"]);
/**
 * Extensions a 台本 is ever delivered as. `.docx` earns its place: one release
 * ships its script as ten `台本_JP_partN.docx`.
 */
const SCRIPT_EXTS = new Set([".txt", ".pdf", ".docx", ".doc", ".rtf"]);

/** Bookkeeping the OS leaves behind. */
const JUNK_NAMES = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

/**
 * Nothing here is worth offering the user: browser shortcuts, an interrupted
 * download, and the split executables that repacks arrive in.
 */
const JUNK_EXTS = new Set([
  ".url",
  ".website",
  ".lnk",
  ".part",
  ".exe",
  ".tmp",
  ".ini",
  ".db",
  ".encrypted",
]);

/**
 * Tokens that mark a file — or the folder holding it — as a 台本.
 *
 * Checked against folders too, and that is not a nicety: one work ships ten
 * scripts as `台本\1　バイノーラル指示あり.txt`, where the word 台本 appears
 * only in the directory name. Matching filenames alone misses all ten.
 */
const SCRIPT_TOKENS = ["台本", "セリフ", "台詞", "だいほん", "daihon", "script"];

/**
 * Reduces a name to letters and digits so the many spellings of one word
 * collapse together.
 *
 * Readmes in the wild are spelled `readme`, `Readme`, `Read me`, `read_me`,
 * `readme txt.txt`, `【readme】<title>.txt`, and — in one release — the typo
 * `Rreadmeクレジット .txt`, with a trailing space before the extension. After
 * this they all contain the substring "readme".
 */
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿]/g, "");
}

/**
 * The many names a "read me first" file goes by.
 *
 * Most releases are Japanese, and only a minority spell it in Latin letters:
 * `リードミー` and `説明書` between them outnumber `readme`. `注意事項` and
 * `利用規約` are the same kind of thing — terms and warnings nobody opened the
 * app to read.
 *
 * Matched as substrings, which is what makes `はじめにお読みください！前日譚音声版`
 * and `ライブ壁紙android用説明書` fall to the same rule.
 */
const README_TOKENS = [
  "readme",
  "リードミー",
  "お読みください",
  "お読み下さい",
  "説明書",
  "注意事項",
  "利用規約",
  "ご購入ありがとうございます",
];

/**
 * Titles that are a readme only when that is the *whole* name, and only for a
 * plain text file.
 *
 * Two limits, each earned. `0a_【はじめに】三つのトークテーマ.txt` is a talk
 * theme rather than front matter, so the match has to be the entire name. And
 * `はじめに.pdf` beside `おわりに.pdf` is a 300 KB illustrated booklet page —
 * a text readme is a couple of kilobytes — so a PDF is left alone.
 */
const README_EXACT = ["はじめに", "おわりに", "最初に"];

function isReadme(basename: string, extension: string): boolean {
  const norm = normalize(basename);
  if (README_TOKENS.some((tok) => norm.includes(normalize(tok)))) return true;
  if (extension !== ".txt") return false;
  return README_EXACT.some((tok) => norm === normalize(tok));
}

/**
 * The first run of digits in a name, as a number.
 *
 * NFKC first, so fullwidth digits count. This is what both a script and a
 * track are keyed by when pairing them up, so the two must be extracted the
 * same way: `tr01_迫る義妹♪` and `セリフ初稿台本_tr01` both yield 1, and
 * `09ex 【…】` yields 9.
 */
export function firstNumber(name: string): number | null {
  const m = name.normalize("NFKC").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

function hasScriptToken(segments: string[]): boolean {
  return segments.some((seg) => {
    const norm = seg.normalize("NFKC").toLowerCase();
    return SCRIPT_TOKENS.some((tok) => norm.includes(tok));
  });
}

/**
 * Decides what a file inside a work folder is, or that it should be ignored.
 *
 * `relativePath` is relative to the work folder, so every segment above it is
 * fair game for the folder-name checks. Returns null for anything that should
 * not be recorded at all: audio (the scanner already made it a track),
 * archives, OS junk, and readmes.
 */
export function classifyAsset(relativePath: string): ClassifiedAsset | null {
  // Scans on either platform may produce either separator.
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  if (segments.length === 0) return null;

  const filename = segments[segments.length - 1];
  const folders = segments.slice(0, -1);
  const extension = path.extname(filename).toLowerCase();
  const title = filename.slice(0, filename.length - extension.length) || filename;

  if (AUDIO_EXTS.has(extension)) return null;
  if ((ARCHIVE_EXTS as readonly string[]).includes(extension)) return null;
  if (JUNK_EXTS.has(extension)) return null;
  if (JUNK_NAMES.has(filename.toLowerCase())) return null;
  // Checked against the filename only, never the folder — otherwise a stray
  // `台本\readme.txt` would be rescued by its own directory below.
  if (isReadme(title, extension)) return null;

  const orderHint = firstNumber(title);

  if (SCRIPT_EXTS.has(extension) && hasScriptToken([title, ...folders])) {
    return { kind: "script", title, extension, orderHint };
  }
  if (IMAGE_EXTS.has(extension)) {
    return { kind: "image", title, extension, orderHint };
  }
  if (VIDEO_EXTS.has(extension)) {
    return { kind: "video", title, extension, orderHint };
  }
  if (extension === ".txt") {
    return { kind: "text", title, extension, orderHint };
  }
  return { kind: "other", title, extension, orderHint };
}
