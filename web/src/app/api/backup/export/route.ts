import { streamBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

function filename(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `kikoeru-backup-${date}.json`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeWaveforms = url.searchParams.get("includeWaveforms") !== "false";
  const encoder = new TextEncoder();

  // Streamed chunk-by-chunk so a large library's base64 covers never have to
  // sit in memory as one string.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamBackup({ includeWaveforms })) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        // The status line is long gone by now, so the only honest signal is a
        // truncated (and therefore unparseable) body.
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename()}"`,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
