import { test } from "node:test";
import assert from "node:assert/strict";
import { isNearEnd, resumePosition } from "./resume";

// ---------------------------------------------------------------------------
// isNearEnd — the tail window is 15s, or 2% of the track when that is longer
// ---------------------------------------------------------------------------

test("treats the last 15 seconds of a short track as the end", () => {
  assert.equal(isNearEnd(584, 600), false);
  assert.equal(isNearEnd(585, 600), true);
  assert.equal(isNearEnd(600, 600), true);
  assert.equal(isNearEnd(601, 600), true); // saved past the end after a reload
});

test("widens the window to 2% on long tracks", () => {
  // A 2h file: 2% is 144s, so the last two and a half minutes count as done.
  assert.equal(isNearEnd(7100, 7200), true);
  assert.equal(isNearEnd(7000, 7200), false);
});

test("cannot judge the end without a duration", () => {
  assert.equal(isNearEnd(500, 0), false);
  assert.equal(isNearEnd(500, null), false);
  assert.equal(isNearEnd(500, undefined), false);
  assert.equal(isNearEnd(500, NaN), false);
});

// ---------------------------------------------------------------------------
// resumePosition
// ---------------------------------------------------------------------------

test("resumes from the saved position mid-track", () => {
  assert.equal(resumePosition({ position: 300, duration: 600 }), 300);
});

test("restarts a track that was left in the tail", () => {
  // This is the skipping bug: 600/600 seeks to the end, <audio> fires `ended`,
  // and the queue moves on before a note is heard.
  assert.equal(resumePosition({ position: 600, duration: 600 }), 0);
  assert.equal(resumePosition({ position: 592, duration: 600 }), 0);
});

test("restarts a track flagged completed, wherever its position sits", () => {
  assert.equal(
    resumePosition({ position: 0, duration: 600, completed: true }),
    0,
  );
  assert.equal(
    resumePosition({ position: 300, duration: 600, completed: true }),
    0,
  );
  // Duration unknown and no tail to measure: the flag is all we have.
  assert.equal(resumePosition({ position: 3000, completed: true }), 0);
});

test("ignores a position too small to be worth resuming", () => {
  assert.equal(resumePosition({ position: 9.9, duration: 600 }), 0);
  assert.equal(resumePosition({ position: 10, duration: 600 }), 10);
});

test("keeps the saved position when the duration is unknown", () => {
  assert.equal(resumePosition({ position: 300 }), 300);
  assert.equal(resumePosition({ position: 300, duration: null }), 300);
});

test("restart mode always starts from zero", () => {
  assert.equal(
    resumePosition({ position: 300, duration: 600, mode: "restart" }),
    0,
  );
});

test("survives the values <audio> reports before metadata loads", () => {
  assert.equal(resumePosition({ position: NaN, duration: NaN }), 0);
  assert.equal(resumePosition({ position: undefined }), 0);
  assert.equal(resumePosition({ position: -5, duration: 600 }), 0);
  assert.equal(resumePosition({ position: 300, duration: Infinity }), 300);
});
