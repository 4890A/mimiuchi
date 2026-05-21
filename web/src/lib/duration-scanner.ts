import "server-only";
import path from "node:path";
import { parseFile } from "music-metadata";
import {
  listAllTracksForDuration,
  listTracksMissingDuration,
  setTrackDuration,
} from "./db/repository";

export type DurationScanEvent =
  | { type: "start"; total: number }
  | {
      type: "track-start";
      index: number;
      total: number;
      workId: string;
      relativePath: string;
    }
  | { type: "track-done"; index: number; total: number; durationSeconds: number }
  | { type: "track-error"; index: number; total: number; message: string }
  | { type: "done"; result: DurationScanResult };

export interface DurationScanResult {
  scanned: number;
  updated: number;
  errors: number;
}

export interface DurationScanOptions {
  forceAll?: boolean;
  onEvent?: (event: DurationScanEvent) => void;
}

export async function scanDurations(
  opts: DurationScanOptions = {},
): Promise<DurationScanResult> {
  const result: DurationScanResult = { scanned: 0, updated: 0, errors: 0 };
  const emit = (e: DurationScanEvent) => opts.onEvent?.(e);

  const rows = opts.forceAll
    ? listAllTracksForDuration()
    : listTracksMissingDuration();
  const total = rows.length;
  emit({ type: "start", total });

  let index = 0;
  for (const row of rows) {
    index++;
    const full = path.join(row.folderPath, row.relativePath);
    emit({
      type: "track-start",
      index,
      total,
      workId: row.workId,
      relativePath: row.relativePath,
    });
    try {
      const meta = await parseFile(full, { duration: true, skipCovers: true });
      const dur = meta.format.duration;
      if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
        setTrackDuration(row.id, dur);
        result.updated++;
        emit({ type: "track-done", index, total, durationSeconds: dur });
      } else {
        result.errors++;
        emit({
          type: "track-error",
          index,
          total,
          message: `no duration in metadata for ${row.relativePath}`,
        });
      }
    } catch (err) {
      result.errors++;
      emit({
        type: "track-error",
        index,
        total,
        message: `${row.relativePath}: ${String(err)}`,
      });
    }
    result.scanned++;
  }

  emit({ type: "done", result });
  return result;
}
