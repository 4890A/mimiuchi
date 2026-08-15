import type fs from "node:fs";

/**
 * A web `ReadableStream` over a Node file read stream, safe to abandon.
 *
 * `Readable.toWeb()` is the obvious way to do this and the wrong one here.
 * Browsers abort media range requests constantly — every seek, every track
 * switch, every time the player drops a partially buffered file — and when the
 * web stream is cancelled the Node stream underneath keeps going. The adapter
 * then calls `close()`/`enqueue()` on a controller that is already closed,
 * which throws `ERR_INVALID_STATE` from a stream callback with nobody to catch
 * it, so it surfaces as an `uncaughtException`: one per aborted request,
 * drowning the server log and leaving the file handle's teardown to chance.
 *
 * This adapter takes the two precautions that avoids: every controller call is
 * guarded by a `done` flag (and wrapped, since the controller can close under
 * us between the check and the call), and the file handle is destroyed on every
 * exit — end, error, cancel, or the request being aborted.
 */
export function fileStream(
  nodeStream: fs.ReadStream,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  let done = false;

  function finish(
    controller: ReadableStreamDefaultController<Uint8Array>,
    err?: Error,
  ) {
    if (done) return;
    done = true;
    nodeStream.destroy();
    try {
      if (err) controller.error(err);
      else controller.close();
    } catch {
      // Already closed by a cancel that raced us — the bytes are gone either
      // way, and this is exactly the throw we exist to swallow.
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        if (done) return;
        try {
          controller.enqueue(new Uint8Array(chunk as Buffer));
        } catch {
          finish(controller);
          return;
        }
        // Respect backpressure: `pull` resumes us when the consumer wants more.
        if ((controller.desiredSize ?? 1) <= 0) nodeStream.pause();
      });
      nodeStream.on("end", () => finish(controller));
      nodeStream.on("error", (err: Error) => finish(controller, err));
      if (signal) {
        if (signal.aborted) finish(controller);
        else signal.addEventListener("abort", () => finish(controller), {
          once: true,
        });
      }
    },
    pull() {
      nodeStream.resume();
    },
    cancel() {
      done = true;
      nodeStream.destroy();
    },
  });
}
