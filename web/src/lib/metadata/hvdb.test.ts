import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { stubGlobalFetch, type StubbedFetch } from "../../test/net";
import { fetchFromHvdb } from "./hvdb";

/**
 * HVDB has no API — the fetcher scrapes the work-details page with regexes.
 * That makes it the most brittle code in `lib/metadata`, so these tests pin
 * the exact markup shapes it handles and the ones it silently misses.
 *
 * `hvdb.ts` uses the *global* fetch rather than the undici package's, so the
 * global is swapped here instead of installing a MockAgent.
 */

let stub: StubbedFetch | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

/**
 * The scraper's regexes don't care which section a tag sits in, so everything
 * goes in the body — putting it in both would double every `extractAll` hit
 * and quietly invalidate the cast/tag assertions.
 */
function page(body: string): string {
  return `<!doctype html><html><head></head><body>${body}</body></html>`;
}

/** A page shaped like a real HVDB work-details response. */
const FULL_PAGE = page(`
  <meta property="og:title" content="&#x30bb;&#x30a4;&#x30a2;ASMR &amp; more" />
  <meta property="og:image" content="https://hvdb.me/img/01678210.jpg" />
  <div>Circle: <a href="/Circle/1">Yostar</a></div>
  <div>CV: <a href="/CV/1">種﨑敦美</a></div>
  <a href="/tag/1" class="tag">ASMR</a>
  <a href="/tag/2" class="tag">Healing</a>
`);

function serve(html: string, status = 200) {
  stub = stubGlobalFetch(() => ({ status, body: html }));
  return stub;
}

// ---------------------------------------------------------------------------
// Request shape
// ---------------------------------------------------------------------------

test("strips the RJ prefix when building the URL but keeps it on the result", async () => {
  const s = serve(FULL_PAGE);
  const work = await fetchFromHvdb("RJ01678210");

  assert.deepEqual(s.calls, [
    "https://hvdb.me/Dashboard/WorkDetails/01678210",
  ]);
  assert.equal(work?.id, "RJ01678210", "the caller's id is echoed back");
  assert.equal(
    work?.dlsiteUrl,
    "https://www.dlsite.com/maniax/work/=/product_id/RJ01678210.html",
  );
});

test("only the leading RJ is stripped", async () => {
  const s = serve(FULL_PAGE);
  await fetchFromHvdb("rj236823");
  assert.deepEqual(s.calls, ["https://hvdb.me/Dashboard/WorkDetails/236823"]);
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("scrapes title, circle, cast and tags", async () => {
  serve(FULL_PAGE);
  const work = await fetchFromHvdb("RJ01678210");

  assert.ok(work);
  // Entities in og:title are decoded — both numeric and named.
  assert.equal(work.title, "セイアASMR & more");
  assert.equal(work.circleName, "Yostar");
  assert.equal(work.coverUrl, "https://hvdb.me/img/01678210.jpg");
  assert.deepEqual(work.voiceActors, [{ name: "種﨑敦美" }]);
  assert.deepEqual(work.tags, [{ name: "ASMR" }, { name: "Healing" }]);
  assert.equal(work.source, "hvdb");
});

test("handles single-quoted meta attributes", async () => {
  serve(page(`<meta property='og:title' content='Quoted Title' />`));
  const work = await fetchFromHvdb("RJ236823");
  assert.equal(work?.title, "Quoted Title");
});

test("returns null when the page has no og:title", async () => {
  serve(page(`<div>Circle: <a>Yostar</a></div>`));
  assert.equal(await fetchFromHvdb("RJ236823"), null);
});

test("treats the placeholder title as 'not found'", async () => {
  // HVDB serves a generic page for unknown ids rather than a 404.
  serve(page(`<meta property="og:title" content="Work Details" />`));
  assert.equal(await fetchFromHvdb("RJ999999"), null);
});

test("returns null on a non-2xx response", async () => {
  serve(FULL_PAGE, 500);
  assert.equal(await fetchFromHvdb("RJ236823"), null);
});

test("propagates a transport failure", async () => {
  stub = stubGlobalFetch(() => ({ status: 0, body: "" }));
  await assert.rejects(() => fetchFromHvdb("RJ236823"));
});

test("leaves optional fields undefined when the markup lacks them", async () => {
  serve(page(`<meta property="og:title" content="Bare" />`));
  const work = await fetchFromHvdb("RJ236823");

  assert.equal(work?.title, "Bare");
  assert.equal(work?.circleName, undefined);
  assert.equal(work?.coverUrl, undefined);
  assert.deepEqual(work?.voiceActors, []);
  assert.deepEqual(work?.tags, []);
});

// ---------------------------------------------------------------------------
// Known limitation — documented rather than asserted as correct
// ---------------------------------------------------------------------------

test("only the first cast member under a single CV: label is picked up", async () => {
  // The CV regex restarts from `CV:` each time, so a label followed by several
  // links yields one name. Works listing each performer under its own CV:
  // label parse fully. Widening the regex would be the fix if HVDB pages in
  // the wild use the first shape.
  serve(
    page(`
      <meta property="og:title" content="Two Performers" />
      <div>CV: <a href="/CV/1">First</a>, <a href="/CV/2">Second</a></div>
    `),
  );
  const oneLabel = await fetchFromHvdb("RJ236823");
  assert.deepEqual(oneLabel?.voiceActors, [{ name: "First" }]);

  stub?.restore();
  serve(
    page(`
      <meta property="og:title" content="Two Performers" />
      <div>CV: <a href="/CV/1">First</a></div>
      <div>CV: <a href="/CV/2">Second</a></div>
    `),
  );
  const twoLabels = await fetchFromHvdb("RJ236823");
  assert.deepEqual(twoLabels?.voiceActors, [
    { name: "First" },
    { name: "Second" },
  ]);
});
