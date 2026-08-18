import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import type { Dispatcher } from "undici";

/**
 * HTTP stubbing for the metadata fetchers.
 *
 * Everything that leaves the process — `lib/metadata/dlsite` and
 * `downloadCover` — calls the `undici` package's `fetch` directly, so a single
 * installed `MockAgent` intercepts the lot.
 *
 * It is opt-in per test file and undoes itself via the returned handle.
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
