import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import type { Dispatcher } from "undici";

/**
 * HTTP stubbing for the metadata fetchers.
 *
 * The codebase reaches the network two different ways, and they need two
 * different stubs:
 *
 *   - `lib/metadata/dlsite` and `downloadCover` call the `undici` package's
 *     `fetch` directly, so an installed `MockAgent` intercepts them.
 *   - `lib/metadata/hvdb` calls the global `fetch`. Node's built-in fetch is a
 *     *separate* copy of undici from the npm package, so the MockAgent does not
 *     reliably reach it — `stubGlobalFetch` swaps the global instead.
 *
 * Both are opt-in per test file and undo themselves via the returned handle.
 */

export interface MockNet {
  agent: MockAgent;
  /** Queues one reply for a given origin + path (query string included). */
  reply(
    origin: string,
    path: string,
    body: unknown,
    init?: { status?: number; headers?: Record<string, string>; times?: number },
  ): void;
  /** Fails the test if a queued reply was never requested. */
  assertAllConsumed(): void;
  restore(): void;
}

/**
 * Installs a MockAgent as the global dispatcher with real network access off,
 * so an un-stubbed request fails loudly instead of silently hitting DLsite.
 */
export function mockNet(): MockNet {
  const previous: Dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);

  return {
    agent,
    reply(origin, path, body, init = {}) {
      const isBuffer = Buffer.isBuffer(body);
      const payload = isBuffer || typeof body === "string" ? body : JSON.stringify(body);
      const headers = init.headers ?? {
        "content-type": isBuffer ? "image/jpeg" : "application/json",
      };
      agent
        .get(origin)
        .intercept({ path, method: "GET" })
        .reply(init.status ?? 200, payload, { headers })
        .times(init.times ?? 1);
    },
    assertAllConsumed() {
      assert.deepEqual(
        agent.pendingInterceptors().map((i) => `${i.origin}${i.path}`),
        [],
        "some stubbed requests were never made",
      );
    },
    restore() {
      setGlobalDispatcher(previous);
    },
  };
}

export type FetchHandler = (
  url: string,
  init?: RequestInit,
) => { status?: number; body: string; headers?: Record<string, string> };

export interface StubbedFetch {
  /** Every URL requested, in order. */
  calls: string[];
  restore(): void;
}

/**
 * Replaces `globalThis.fetch` with `handler`. Returning `status: 0` from the
 * handler makes the call reject, which is how network failure is simulated.
 */
export function stubGlobalFetch(handler: FetchHandler): StubbedFetch {
  const original = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const res = handler(url, init);
    if (res.status === 0) throw new TypeError(`fetch failed: ${url}`);
    return new Response(res.body, {
      status: res.status ?? 200,
      headers: res.headers ?? { "content-type": "text/html; charset=utf-8" },
    });
  }) as typeof globalThis.fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}
