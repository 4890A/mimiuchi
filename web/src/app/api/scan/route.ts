import { scanLibrary, type ScanEvent } from "@/lib/scanner";
import { LIBRARY_ROOT, COVERS_DIR } from "@/lib/config";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const queue: ScanEvent[] = [];
      let flushing = false;
      const flush = () => {
        if (flushing) return;
        flushing = true;
        while (queue.length) {
          const ev = queue.shift()!;
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        }
        flushing = false;
      };
      try {
        await scanLibrary({
          libraryRoot: LIBRARY_ROOT,
          coversDir: COVERS_DIR,
          forceMetadata: force,
          onEvent: (ev) => {
            queue.push(ev);
            flush();
          },
        });
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", message: String(err) }) + "\n",
          ),
        );
      } finally {
        flush();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
