import fs from "node:fs/promises";
import path from "node:path";
import { fetch as undiciFetch } from "undici";

/**
 * Re-records the DLsite API responses that the metadata tests replay.
 *
 *   pnpm -C web test:fixtures
 *
 * The fixtures make the parser tests fast and offline, but they also go stale
 * without anyone noticing. Run this when a DLsite change is suspected, then
 * diff the result — a non-empty diff is the signal that `lib/metadata/dlsite`
 * may need updating, and the test expectations along with it.
 *
 * Only all-ages works belong here: the fixtures are committed.
 */

const FIXTURE_DIR = path.join(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "metadata",
  "__fixtures__",
);

/** Every id must be age_category 1 (general). */
const WORK_IDS = ["RJ01678210"];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.5",
  Cookie: "adultchecked=1; locale=ja-jp",
};

async function capture(id: string): Promise<void> {
  const url = `https://www.dlsite.com/maniax/api/=/product.json?workno=${id}`;
  const res = await undiciFetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`${id}: DLsite responded ${res.status}`);
  }

  const body = (await res.json()) as Array<Record<string, unknown>>;
  const work = body?.[0];
  if (!work?.workno) {
    throw new Error(`${id}: unexpected payload shape`);
  }
  if (work.age_category !== 1) {
    throw new Error(
      `${id}: age_category is ${work.age_category}, refusing to commit a non-all-ages fixture`,
    );
  }

  const dest = path.join(FIXTURE_DIR, `dlsite-${id}.json`);
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  await fs.writeFile(dest, JSON.stringify(body, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), dest)}  (${work.work_name})`);
}

async function main(): Promise<void> {
  for (const id of WORK_IDS) {
    await capture(id);
  }
  console.log("\nDiff the fixtures; if the shape changed, update lib/metadata/dlsite.ts.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
