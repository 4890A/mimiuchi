import { beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mockNet, type MockNet } from "../../test/net";
import { DlsiteUnavailableError, fetchFromDlsite } from "./dlsite";

/** Retry tests assert on the delays rather than sitting through them. */
const noSleep = async () => {};

/**
 * Parser tests for the DLsite announce API.
 *
 * The happy path runs against a byte-for-byte capture of the real response for
 * RJ01678210 (an all-ages ASMR work), replayed through an undici MockAgent —
 * so these assert what the live API actually returns without touching the
 * network. `dlsite.live.test.ts` covers the real connection separately.
 *
 * Re-capture the fixture with:
 *   pnpm -C web test:fixtures
 */

const ORIGIN = "https://www.dlsite.com";
const API_PATH = (id: string) => `/maniax/api/=/product.json?workno=${id}`;
const WORK_ID = "RJ01678210";

const FIXTURE = JSON.parse(
  fs.readFileSync(
    new URL("./__fixtures__/dlsite-RJ01678210.json", import.meta.url),
    "utf8",
  ),
) as Array<Record<string, unknown>>;

/** A minimal well-formed row, for tests that vary one field at a time. */
function row(overrides: Record<string, unknown> = {}) {
  return [{ workno: WORK_ID, work_name: "Test Work", ...overrides }];
}

let net: MockNet;

beforeEach(() => {
  net = mockNet();
});

afterEach(() => {
  net.restore();
});

// ---------------------------------------------------------------------------
// The real response
// ---------------------------------------------------------------------------

test("parses the recorded RJ01678210 response", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), FIXTURE);

  const work = await fetchFromDlsite(WORK_ID);
  assert.ok(work, "expected a work");

  assert.equal(work.id, WORK_ID);
  assert.equal(work.title, "【ブルーアーカイブ】セイアASMR～太陽と月と言葉と君の～");
  assert.equal(
    work.titleKana,
    "ブルーアーカイブセイアエーエスエムアールタイヨウトツキトコトバトキミノ",
  );
  assert.equal(work.circleName, "Yostar");
  assert.equal(work.workType, "ボイス・ASMR");
  assert.equal(work.source, "dlsite");

  // regist_date is a full timestamp; only the date half is kept.
  assert.equal(work.releaseDate, "2026-07-27");

  // age_category 1 = all-ages, so this work is not NSFW.
  assert.equal(work.ageRating, "all");
  assert.equal(work.nsfw, false);

  assert.deepEqual(
    work.voiceActors.map((v) => v.name),
    ["種﨑敦美"],
  );
  assert.deepEqual(
    work.tags.map((t) => t.name),
    ["ASMR", "癒し", "バイノーラル/ダミヘ", "萌え"],
  );

  // The API returns protocol-relative image URLs; they must come back absolute.
  assert.equal(
    work.coverUrl,
    "https://img.dlsite.jp/modpub/images2/work/doujin/RJ01679000/RJ01678210_img_main.jpg",
  );
  assert.equal(
    work.coverThumbUrl,
    "https://img.dlsite.jp/modpub/images2/work/doujin/RJ01679000/RJ01678210_img_sam.jpg",
  );
  assert.equal(
    work.dlsiteUrl,
    `https://www.dlsite.com/maniax/work/=/product_id/${WORK_ID}.html`,
  );

  net.assertAllConsumed();
});

test("sends the age-gate cookie and a browser user agent", async () => {
  // Matching on headers means the interceptor simply won't fire without them,
  // and the request fails against the net-connect-disabled agent.
  net.agent
    .get(ORIGIN)
    .intercept({
      path: API_PATH(WORK_ID),
      method: "GET",
      headers: {
        Cookie: "adultchecked=1; locale=ja-jp",
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.5",
      },
    })
    .reply(200, JSON.stringify(FIXTURE), {
      headers: { "content-type": "application/json" },
    });

  const work = await fetchFromDlsite(WORK_ID);
  assert.equal(work?.id, WORK_ID);
});

// ---------------------------------------------------------------------------
// Failure and edge cases
// ---------------------------------------------------------------------------

test("returns null on a non-2xx response", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), { error: "nope" }, { status: 404 });
  assert.equal(await fetchFromDlsite(WORK_ID), null);
});

test("returns null when the API returns an empty list", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), []);
  assert.equal(await fetchFromDlsite(WORK_ID), null);
});

test("returns null when the payload is not a list", async () => {
  // DLsite answers unknown ids with an object rather than an array.
  net.reply(ORIGIN, API_PATH(WORK_ID), { workno: WORK_ID });
  assert.equal(await fetchFromDlsite(WORK_ID), null);
});

test("returns null when the row has no workno", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), [{ work_name: "Orphan" }]);
  assert.equal(await fetchFromDlsite(WORK_ID), null);
});

test("propagates transport errors rather than swallowing them", async () => {
  net.agent
    .get(ORIGIN)
    .intercept({ path: API_PATH(WORK_ID), method: "GET" })
    .replyWithError(new Error("socket hang up"))
    .times(3);

  // A dead socket must not look like "work not found" — a proxy that isn't
  // there would otherwise quietly wipe every work's metadata.
  await assert.rejects(
    () => fetchFromDlsite(WORK_ID, { sleep: noSleep }),
    DlsiteUnavailableError,
  );
});

// ---------------------------------------------------------------------------
// Retries and backoff
// ---------------------------------------------------------------------------

test("retries a 429 and returns the work when it clears", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), "", { status: 429, headers: {} });
  net.reply(ORIGIN, API_PATH(WORK_ID), FIXTURE);

  const waits: number[] = [];
  const work = await fetchFromDlsite(WORK_ID, {
    sleep: async (ms) => void waits.push(ms),
    baseDelayMs: 1000,
  });

  assert.ok(work, "the second attempt succeeds");
  assert.deepEqual(waits, [1000], "one backoff, at the base delay");
  net.assertAllConsumed();
});

test("honours Retry-After over the computed backoff", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), "", {
    status: 429,
    headers: { "retry-after": "2" },
  });
  net.reply(ORIGIN, API_PATH(WORK_ID), FIXTURE);

  const waits: number[] = [];
  await fetchFromDlsite(WORK_ID, {
    sleep: async (ms) => void waits.push(ms),
    baseDelayMs: 1000,
  });

  assert.deepEqual(waits, [2000], "DLsite's own number wins");
});

test("gives up after the attempt budget and reports the status", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), "", { status: 503, times: 3 });

  const info: Array<{ attempt: number; delayMs: number }> = [];
  await assert.rejects(
    () =>
      fetchFromDlsite(WORK_ID, {
        sleep: noSleep,
        baseDelayMs: 100,
        onRetry: (i) => info.push({ attempt: i.attempt, delayMs: i.delayMs }),
      }),
    (err: unknown) => {
      assert.ok(err instanceof DlsiteUnavailableError);
      assert.equal(err.status, 503);
      assert.equal(err.attempts, 3);
      return true;
    },
  );

  // Three attempts means two waits, and the delay doubles between them.
  assert.deepEqual(info, [
    { attempt: 1, delayMs: 100 },
    { attempt: 2, delayMs: 200 },
  ]);
  net.assertAllConsumed();
});

test("a 404 is a settled answer and costs exactly one request", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), "", { status: 404 });

  const waits: number[] = [];
  assert.equal(
    await fetchFromDlsite(WORK_ID, { sleep: async (ms) => void waits.push(ms) }),
    null,
  );
  assert.deepEqual(waits, [], "a missing work is not retried");
  net.assertAllConsumed();
});

test("an empty list is a settled answer too", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), []);

  const waits: number[] = [];
  assert.equal(
    await fetchFromDlsite(WORK_ID, { sleep: async (ms) => void waits.push(ms) }),
    null,
  );
  assert.deepEqual(waits, []);
  net.assertAllConsumed();
});

// ---------------------------------------------------------------------------
// Field-level behaviour
// ---------------------------------------------------------------------------

test("maps every age_category to a rating", async () => {
  const cases: Array<[number | undefined, string | undefined, boolean]> = [
    [1, "all", false],
    [2, "r15", false],
    [3, "adult", true],
    [undefined, undefined, false],
  ];

  for (const [raw, expected, nsfw] of cases) {
    net.reply(ORIGIN, API_PATH(WORK_ID), row({ age_category: raw }));
    const work = await fetchFromDlsite(WORK_ID);
    assert.equal(work?.ageRating, expected, `age_category ${raw}`);
    assert.equal(work?.nsfw, nsfw, `age_category ${raw} nsfw`);
  }
});

test("falls back to the bucketed image URL when the API omits the cover", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), row());
  const work = await fetchFromDlsite(WORK_ID);

  // 1678210 buckets up to 1679000, zero-padded to the original 8 digits.
  assert.equal(
    work?.coverUrl,
    "https://img.dlsite.jp/modpub/images2/work/doujin/RJ01679000/RJ01678210_img_main.jpg",
  );
  assert.equal(work?.coverThumbUrl, undefined);
});

test("leaves already-absolute image URLs alone", async () => {
  net.reply(
    ORIGIN,
    API_PATH(WORK_ID),
    row({ image_main: { url: "https://cdn.example/a.jpg" } }),
  );
  const work = await fetchFromDlsite(WORK_ID);
  assert.equal(work?.coverUrl, "https://cdn.example/a.jpg");
});

test("uses relative_url when url is absent", async () => {
  net.reply(
    ORIGIN,
    API_PATH(WORK_ID),
    row({ image_main: { relative_url: "//img.dlsite.jp/x.jpg" } }),
  );
  const work = await fetchFromDlsite(WORK_ID);
  assert.equal(work?.coverUrl, "https://img.dlsite.jp/x.jpg");
});

test("trims creator and genre names and drops blank ones", async () => {
  net.reply(
    ORIGIN,
    API_PATH(WORK_ID),
    row({
      creaters: {
        voice_by: [
          { name: "  Someone  ", name_en: "  Some One  " },
          { name: "   " },
          { name_en: "no name at all" },
        ],
      },
      genres: [{ name: " ASMR ", name_en: "" }, { name: "" }],
    }),
  );

  const work = await fetchFromDlsite(WORK_ID);
  assert.deepEqual(work?.voiceActors, [{ name: "Someone", nameEn: "Some One" }]);
  assert.deepEqual(work?.tags, [{ name: "ASMR", nameEn: undefined }]);
});

test("tolerates a row with no creaters or genres at all", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), row());
  const work = await fetchFromDlsite(WORK_ID);
  assert.deepEqual(work?.voiceActors, []);
  assert.deepEqual(work?.tags, []);
});

test("prefers intro over intro_s for the description", async () => {
  net.reply(ORIGIN, API_PATH(WORK_ID), row({ intro: "long", intro_s: "short" }));
  assert.equal((await fetchFromDlsite(WORK_ID))?.description, "long");

  net.reply(ORIGIN, API_PATH(WORK_ID), row({ intro_s: "short" }));
  assert.equal((await fetchFromDlsite(WORK_ID))?.description, "short");
});

test("reports the workno the API returned, not the one requested", async () => {
  // DLsite normalises zero-padded variants; the caller re-stamps the id, but
  // the fetcher itself must echo what came back so that remap is visible.
  net.reply(ORIGIN, API_PATH("RJ1678210"), row({ workno: WORK_ID }));
  const work = await fetchFromDlsite("RJ1678210");
  assert.equal(work?.id, WORK_ID);
});
