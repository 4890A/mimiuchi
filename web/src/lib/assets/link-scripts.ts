import { firstNumber } from "./classify";

/**
 * Pairs per-track 台本 with the tracks they belong to.
 *
 * Several releases ship one script per track — `セリフ初稿台本_tr01.txt`
 * through `_tr06.txt`, or `台本\0…8` beside tracks `00…08`. Pairing them lets
 * a track row offer its own script.
 *
 * `tracks.track_number` cannot be used for this. `TRACK_NUM_RE` in the scanner
 * needs a leading digit, and the tracks that have per-track scripts are named
 * `tr01_…`, so their track number is NULL — precisely the works this matters
 * for. Both sides are keyed off the filename instead, through the same
 * `firstNumber` extractor, so `tr01_迫る義妹♪` and `セリフ初稿台本_tr01` meet
 * at 1.
 */

export interface LinkableScript {
  id: number;
  title: string;
  extension: string;
  orderHint: number | null;
}

export interface LinkableTrack {
  id: number;
  relativePath: string;
}

function basename(relativePath: string): string {
  const segs = relativePath.split(/[\\/]/);
  const file = segs[segs.length - 1] ?? relativePath;
  return file.replace(/\.[^.]+$/, "");
}

/**
 * Maps track id → script asset id, for the tracks that have one.
 *
 * Only `.txt` scripts take part. A PDF opens in a new tab, which is a strange
 * thing to hang off a track row, and excluding them also avoids a real false
 * positive: a work whose two per-character scripts are named
 * `b06台本_美綾_おまけ用_.pdf` and `b06台本_莉音_おまけ用_.pdf` would otherwise
 * both claim track 6.
 *
 * A number claimed by more than one script is dropped rather than guessed at,
 * so an ambiguous set links nothing instead of linking wrongly. Tracks with no
 * number, or no script at that number, are simply absent from the map.
 */
export function linkScriptsToTracks(
  scripts: LinkableScript[],
  tracks: LinkableTrack[],
): Map<number, number> {
  const readable = scripts.filter((s) => s.extension.toLowerCase() === ".txt");

  // A single script is the whole work's script, not one track's. Requiring two
  // keeps `台本.txt` from attaching itself to whichever track happens to share
  // a digit with it. Judged on what the work ships, before ambiguous numbers
  // are dropped below, so one unusable pair does not disqualify the rest.
  if (readable.length < 2) return new Map();

  const bySeq = new Map<number, number>();
  const ambiguous = new Set<number>();
  for (const s of readable) {
    const seq = s.orderHint ?? firstNumber(s.title);
    if (seq === null) continue;
    if (bySeq.has(seq)) {
      ambiguous.add(seq);
      continue;
    }
    bySeq.set(seq, s.id);
  }
  for (const seq of ambiguous) bySeq.delete(seq);

  const out = new Map<number, number>();
  for (const t of tracks) {
    const seq = firstNumber(basename(t.relativePath));
    if (seq === null) continue;
    const assetId = bySeq.get(seq);
    if (assetId !== undefined) out.set(t.id, assetId);
  }
  return out;
}
