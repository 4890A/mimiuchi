import { scanDurations, type DurationScanEvent } from "@/lib/duration-scanner";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const forceAll = url.searchParams.get("all") === "1";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: DurationScanEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };
      try {
        await scanDurations({ forceAll, onEvent: send });
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "track-error",
              index: 0,
              total: 0,
              message: String(err),
            }) + "\n",
          ),
        );
      } finally {
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
