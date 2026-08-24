/**
 * Turns a 台本 file on disk into text the reader can render.
 *
 * Every .txt in the library this was built against is UTF-8 — six of them with
 * a BOM, none Shift-JIS, none UTF-16. The BOM sniffing and the Shift-JIS
 * fallback are insurance for libraries that are not this one, since a Japanese
 * text file from an older release plausibly is CP932 and would otherwise
 * render as mojibake with no way for the user to tell why.
 *
 * Line endings are genuinely mixed in practice — some files are pure CRLF,
 * some pure LF, and at least one is 115 LF plus a single CRLF — so they are
 * normalized rather than trusted.
 */

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function startsWith(buf: Uint8Array, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

export function decodeTextFile(buf: Uint8Array): string {
  if (startsWith(buf, UTF8_BOM)) {
    return normalizeNewlines(
      new TextDecoder("utf-8").decode(buf.subarray(UTF8_BOM.length)),
    );
  }
  if (startsWith(buf, UTF16LE_BOM)) {
    return normalizeNewlines(
      new TextDecoder("utf-16le").decode(buf.subarray(UTF16LE_BOM.length)),
    );
  }
  if (startsWith(buf, UTF16BE_BOM)) {
    return normalizeNewlines(
      new TextDecoder("utf-16be").decode(buf.subarray(UTF16BE_BOM.length)),
    );
  }

  // No BOM. Strict UTF-8 first: `fatal` is what makes this a test rather than
  // a guess, since a CP932 file will almost always contain a byte sequence
  // that is not valid UTF-8 and will throw here.
  try {
    return normalizeNewlines(
      new TextDecoder("utf-8", { fatal: true }).decode(buf),
    );
  } catch {
    // Node ships full ICU, so shift_jis is available without a dependency.
    try {
      return normalizeNewlines(new TextDecoder("shift_jis").decode(buf));
    } catch {
      // Last resort: lossy UTF-8 rather than an error page.
      return normalizeNewlines(new TextDecoder("utf-8").decode(buf));
    }
  }
}
