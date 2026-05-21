import { scanLibrary, type ScanEvent } from "@/lib/scanner";
import { resolveLibraryRoot, resolveCoversDir } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import { listWorkIdsMissingSeiyuu } from "@/lib/db/repository";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const mode = url.searchParams.get("mode");
  const encoder = new TextEncoder();

  const settings = getSettings();
  const libraryRoot = resolveLibraryRoot(settings.libraryRoot);
  const coversDir = resolveCoversDir(settings.coversDir);

  let filterIds: ReadonlySet<string> | undefined;
  let forceMetadata = force;
  if (mode === "missing-seiyuu") {
    filterIds = new Set(listWorkIdsMissingSeiyuu());
    forceMetadata = true;
  }

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
          libraryRoot,
          coversDir,
          forceMetadata,
          filterIds,
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
