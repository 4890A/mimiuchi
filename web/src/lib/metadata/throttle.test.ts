import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  resetDlsiteThrottle,
  setDlsiteMinInterval,
  throttled,
} from "./throttle";

/**
 * The gate is module state shared by every DLsite caller, so each test resets
 * it — otherwise one test's interval would pace the next one's requests.
 */
afterEach(() => {
  resetDlsiteThrottle();
});

test("leaves calls alone when the interval is zero", async () => {
  setDlsiteMinInterval(0);
  const started = Date.now();
  await Promise.all([1, 2, 3].map((n) => throttled(async () => n)));
  assert.ok(Date.now() - started < 40, "no waiting when unthrottled");
});

test("spaces consecutive calls by the interval", async () => {
  setDlsiteMinInterval(50);
  const at: number[] = [];
  const started = Date.now();

  await Promise.all(
    [1, 2, 3].map(() => throttled(async () => at.push(Date.now() - started))),
  );

  assert.equal(at.length, 3);
  // The first goes immediately; each one after waits out the interval. Timers
  // fire late, never early, so only the lower bound is worth asserting.
  assert.ok(at[1] - at[0] >= 45, `second call too soon: ${at[1] - at[0]}ms`);
  assert.ok(at[2] - at[1] >= 45, `third call too soon: ${at[2] - at[1]}ms`);
});

test("runs calls in the order they queued", async () => {
  setDlsiteMinInterval(10);
  const order: number[] = [];
  await Promise.all(
    [1, 2, 3, 4].map((n) => throttled(async () => void order.push(n))),
  );
  assert.deepEqual(order, [1, 2, 3, 4]);
});

test("a failed call does not stall the queue behind it", async () => {
  setDlsiteMinInterval(1);
  const boom = throttled(async () => {
    throw new Error("boom");
  });
  await assert.rejects(() => boom);
  assert.equal(await throttled(async () => "fine"), "fine");
});
