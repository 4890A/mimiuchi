import { scanLibrary, type ScanEvent } from "../src/lib/scanner";
import { LIBRARY_ROOT, COVERS_DIR } from "../src/lib/config";

async function main() {
  const force = process.argv.includes("--force-metadata");
  console.log(`Scanning ${LIBRARY_ROOT}`);
  console.log(`Covers -> ${COVERS_DIR}`);
  const result = await scanLibrary({
    libraryRoot: LIBRARY_ROOT,
    coversDir: COVERS_DIR,
    forceMetadata: force,
    onEvent: (ev: ScanEvent) => {
      switch (ev.type) {
        case "start":
          console.log(`[scan] Found ${ev.total} works`);
          break;
        case "work-start":
          console.log(`[scan] [${ev.index}/${ev.total}] ${ev.workId}`);
          break;
        case "fetch-meta":
          console.log(`[scan]   → fetching metadata for ${ev.workId}`);
          break;
        case "meta-result":
          console.log(
            ev.found
              ? `[scan]   ✓ ${ev.source}: ${ev.title ?? ev.workId}`
              : `[scan]   ✗ no metadata for ${ev.workId}`,
          );
          break;
        case "fetch-cover":
          console.log(`[scan]   → cover ${ev.url}`);
          break;
        case "cover-saved":
          console.log(`[scan]   ✓ cover saved for ${ev.workId}`);
          break;
        case "tracks-done":
          console.log(`[scan]   • ${ev.tracks} tracks for ${ev.workId}`);
          break;
        case "error":
          console.warn(`[scan]   ! ${ev.message}`);
          break;
        case "done":
          console.log(
            `[scan] Done. works=${ev.result.worksFound} new=${ev.result.worksNew} tracks=${ev.result.tracksScanned} meta=${ev.result.metadataFetched} errors=${ev.result.errors.length}`,
          );
          break;
      }
    },
  });
  console.log("\n=== Scan complete ===");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
