/**
 * Where a track should start when it is picked up again.
 *
 * Positions are written continuously while a track plays, so one that ran to
 * the end has a stored position sitting on (or a hair before) its duration.
 * Seeking there on the next play fires `ended` immediately, which advances the
 * queue — so a finished track looks like it was skipped, and a run of finished
 * tracks skips the lot. Anything that stopped inside the tail of a track is
 * therefore read as "already heard" and starts over from the beginning.
 *
 * Pure and DOM-free so it can be unit tested; the player calls it in two
 * places, once from the queue's stored duration and again once <audio> reports
 * the real one.
 */

export type ResumeMode = "resume" | "restart";

export const DEFAULT_RESUME_MODE: ResumeMode = "resume";

/** Below this there is nothing worth resuming — start over instead. */
export const RESUME_MIN_SECONDS = 10;
/** A position within this much of the end counts as finished. */
export const RESUME_TAIL_SECONDS = 15;
/** …or this share of a long track, whichever window is wider. */
export const RESUME_TAIL_FRACTION = 0.02;

export function isResumeMode(v: unknown): v is ResumeMode {
  return v === "resume" || v === "restart";
}

function finite(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * True when `position` is close enough to the end of a track of `duration`
 * that resuming there would play little or nothing. Always false when the
 * duration is unknown — there is no end to measure against yet.
 */
export function isNearEnd(
  position: number | null | undefined,
  duration: number | null | undefined,
): boolean {
  const dur = finite(duration);
  if (dur <= 0) return false;
  const tail = Math.max(RESUME_TAIL_SECONDS, dur * RESUME_TAIL_FRACTION);
  return finite(position) >= dur - tail;
}

/**
 * The position to seek to when starting `track`, in seconds. Zero means "play
 * from the start", which is also the answer for every finished track.
 */
export function resumePosition({
  position,
  duration,
  completed = false,
  mode = DEFAULT_RESUME_MODE,
}: {
  /** Last saved position, in seconds. */
  position: number | null | undefined;
  /** Track length in seconds; 0/null when it has never been scanned. */
  duration?: number | null;
  /** Set once the track has played through to the end. */
  completed?: boolean;
  mode?: ResumeMode;
}): number {
  if (mode === "restart") return 0;
  if (completed) return 0;
  const pos = finite(position);
  if (pos < RESUME_MIN_SECONDS) return 0;
  if (isNearEnd(pos, duration)) return 0;
  return pos;
}
