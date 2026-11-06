/**
 * Folder paths as people actually type or paste them.
 *
 * Explorer's "Copy as path" wraps the path in double quotes, and a path pasted
 * from a terminal may carry single quotes. Neither is ever part of a real
 * folder name, so they are stripped rather than resolved into a folder called
 * `"D:\Audio"` that does not exist.
 *
 * No `server-only`: the settings form and the setup form use this too.
 */
export function cleanPathInput(raw: string): string {
  let s = raw.trim();
  while (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** One path per line, cleaned, blanks dropped. */
export function parsePathList(raw: string): string[] {
  return raw.split(/\r?\n/).map(cleanPathInput).filter(Boolean);
}
