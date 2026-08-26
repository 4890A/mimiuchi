import { scanLibrary, type ScanEvent } from "@/lib/scanner";
import { scanDurations } from "@/lib/duration-scanner";
import { resolveLibraryRoots, resolveCoversDir } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import { listWorkIdsMissingSeiyuu } from "@/lib/db/repository";

/**
 * The scan flags, as `scan-progress.tsx` serializes them.
 *
 * Independent booleans, one per flag, so adding a mode is a line here and a
 * line there rather than another branch of an if/else chain that could only
 * ever express one mode at a time.
 */
function parseScanOptions(url: URL) {
  const on = (name: string) => url.searchParams.get(name) === "1";
  return {
    force: on("force"),
    // Re-reads every work's files without touching DLsite. The middle ground
    // between an incremental scan, which cannot see a file added inside a
    // subfolder, and a force rescan, which re-fetches every listing to find it.
    extras: on("extras"),
    missingSeiyuu: on("missingSeiyuu"),
  };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const { force, extras: extrasOnly, missingSeiyuu } = parseScanOptions(url);
  const encoder = new TextEncoder();

  const settings = getSettings();
  const libraryRoots = resolveLibraryRoots(settings.libraryRoots);
  const coversDir = resolveCoversDir(settings.coversDir);

  let filterIds: ReadonlySet<string> | undefined;
  let forceMetadata = force;
  if (missingSeiyuu) {
    filterIds = new Set(listWorkIdsMissingSeiyuu());
    forceMetadata = true;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: ScanEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };
      try {
        let libraryDone: Extract<ScanEvent, { type: "done" }> | null = null;
        let willChainDurations = !missingSeiyuu;
        await scanLibrary({
          libraryRoots,
          coversDir,
          forceMetadata,
          skipMetadata: extrasOnly,
          includeUnmatchedFolders: settings.includeUnmatchedFolders,
          filterIds,
          onEvent: (ev) => {
            // A scan cut short by a DLsite outage added no tracks worth
            // measuring, so let its "done" through and skip the chase.
            if (ev.type === "done" && ev.result.aborted) {
              willChainDurations = false;
              send(ev);
              return;
            }
            // Hold the library scan's "done" until the durations phase
            // finishes — otherwise the client marks the panel complete.
            if (ev.type === "done" && willChainDurations) {
              libraryDone = ev;
              return;
            }
            send(ev);
          },
        });

        // Follow with a durations pass for any newly-indexed tracks. Skip in
        // missing-seiyuu mode (it doesn't add tracks). `forceAll: false` means
        // only tracks lacking a stored duration are touched, so this is fast
        // and idempotent on subsequent runs.
        if (willChainDurations) {
          await scanDurations({
            forceAll: false,
            onEvent: (ev) => {
              switch (ev.type) {
                case "start":
                  send({ type: "durations-start", total: ev.total });
                  break;
                case "track-start":
                  send({
                    type: "durations-track",
                    index: ev.index,
                    total: ev.total,
                    workId: ev.workId,
                    relativePath: ev.relativePath,
                  });
                  break;
                case "track-done":
                  // Reported on the next track-start; emit a final per-track
                  // event so the UI can show the duration if desired.
                  break;
                case "track-error":
                  send({ type: "error", message: ev.message });
                  break;
                case "done":
                  send({
                    type: "durations-done",
                    updated: ev.result.updated,
                    errors: ev.result.errors,
                  });
                  break;
              }
            },
          });
          if (libraryDone) send(libraryDone);
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", message: String(err) }) + "\n",
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
