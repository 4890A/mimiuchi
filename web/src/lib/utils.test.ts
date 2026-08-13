import { test } from "node:test";
import assert from "node:assert/strict";
import { cn, formatTime } from "./utils";

// ---------------------------------------------------------------------------
// formatTime — fed straight from <audio>.currentTime, which lies before load
// ---------------------------------------------------------------------------

test("formats seconds as m:ss", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(5), "0:05");
  assert.equal(formatTime(59), "0:59");
  assert.equal(formatTime(60), "1:00");
  assert.equal(formatTime(61), "1:01");
  assert.equal(formatTime(599), "9:59");
});

test("lets minutes run past 60 rather than adding an hours field", () => {
  assert.equal(formatTime(3600), "60:00");
  assert.equal(formatTime(7325), "122:05");
});

test("truncates fractional seconds instead of rounding up", () => {
  assert.equal(formatTime(59.9), "0:59");
  assert.equal(formatTime(0.4), "0:00");
});

test("returns 0:00 for the values <audio> reports before metadata loads", () => {
  assert.equal(formatTime(NaN), "0:00");
  assert.equal(formatTime(Infinity), "0:00");
  assert.equal(formatTime(-Infinity), "0:00");
  assert.equal(formatTime(-1), "0:00");
});

// ---------------------------------------------------------------------------
// cn — tailwind-merge wrapper
// ---------------------------------------------------------------------------

test("later tailwind classes win over earlier conflicting ones", () => {
  assert.equal(cn("p-2", "p-4"), "p-4");
  assert.equal(cn("text-sm text-red-500", "text-lg"), "text-red-500 text-lg");
});

test("drops falsy values and flattens conditionals", () => {
  assert.equal(cn("a", false, null, undefined, "b"), "a b");
  assert.equal(cn("base", { active: true, hidden: false }), "base active");
  assert.equal(cn(["x", "y"]), "x y");
  assert.equal(cn(), "");
});
