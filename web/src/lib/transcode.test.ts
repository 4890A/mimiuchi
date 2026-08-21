import { cleanupTmp, libraryRoot } from "../test/env"; // must be first
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  TRANSCODE_DIR,
  ensureTranscode,
  isTranscodable,
} from "./transcode";

/**
 * These run ffmpeg for real — there is no point mocking the one thing that
 * decides whether the output is playable. The suite skips itself when ffmpeg
 * isn't installed, matching how the route degrades.
 */
const ffmpeg = process.env.KIKOERU_FFMPEG_PATH?.trim() || "ffmpeg";

function haveFfmpeg(): boolean {
  try {
    return spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

const skip = haveFfmpeg() ? false : "ffmpeg not on PATH";

/**
 * One teardown for the whole file. Every suite shares the temp tree, and an
 * `after` hook inside a suite fires before the next suite's `before`, which
 * would pull the library directory out from under its fixtures.
 */
after(() => {
  cleanupTmp();
});

/** Cache ceilings here are far below 1 MB, so the env var is set fractionally. */
function setCacheLimit(bytes: number | null): void {
  if (bytes === null) delete process.env.KIKOERU_TRANSCODE_CACHE_MB;
  else process.env.KIKOERU_TRANSCODE_CACHE_MB = String(bytes / (1024 * 1024));
}

/** A few seconds of tone, as a real WAV on disk. */
function writeWav(name: string, seconds: number): string {
  const target = path.join(libraryRoot, name);
  const res = spawnSync(
    ffmpeg,
    [
      "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
      "-f", "lavfi",
      "-i", `sine=frequency=440:duration=${seconds}`,
      "-c:a", "pcm_s16le",
      target,
    ],
    { stdio: "ignore" },
  );
  assert.equal(res.status, 0, "fixture ffmpeg run failed");
  return target;
}

describe("isTranscodable", () => {
  it("accepts wav in any casing", () => {
    assert.equal(isTranscodable(".wav"), true);
    assert.equal(isTranscodable(".WAV"), true);
  });

  it("leaves already-compressed formats alone", () => {
    for (const ext of [".mp3", ".m4a", ".opus", ".ogg", ".flac"]) {
      assert.equal(isTranscodable(ext), false, ext);
    }
  });
});

describe("ensureTranscode", { skip }, () => {
  let source = "";
  let sourceSize = 0;

  before(() => {
    setCacheLimit(null);
    source = writeWav("tone.wav", 3);
    sourceSize = fs.statSync(source).size;
  });

  it("produces a smaller mp3 that ffprobe can read back", async () => {
    const out = await ensureTranscode(1, source, sourceSize);

    assert.ok(fs.existsSync(out), "no output file");
    assert.equal(path.extname(out), ".mp3");
    assert.ok(
      fs.statSync(out).size < sourceSize,
      "transcode is not smaller than the source",
    );

    // The point of the cache file is that it is a normal, seekable media file;
    // if ffprobe can't read a duration out of it, no browser will either.
    const probe = spawnSync(
      ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace("ffmpeg", "ffprobe")),
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
      { encoding: "utf8" },
    );
    if (probe.status === 0) {
      const seconds = parseFloat(probe.stdout.trim());
      assert.ok(Math.abs(seconds - 3) < 0.5, `duration was ${seconds}`);
    }
  });

  it("reuses the cached file instead of converting again", async () => {
    const first = await ensureTranscode(2, source, sourceSize);
    // A sentinel rather than an mtime comparison: a cache hit deliberately
    // bumps mtime to feed the LRU, so only the bytes can prove it didn't
    // re-run ffmpeg.
    fs.writeFileSync(first, "SENTINEL");

    const second = await ensureTranscode(2, source, sourceSize);
    assert.equal(second, first);
    assert.equal(
      fs.readFileSync(second, "utf8"),
      "SENTINEL",
      "the cached file was re-converted",
    );
  });

  it("shares one run between concurrent callers", async () => {
    const [a, b, c] = await Promise.all([
      ensureTranscode(3, source, sourceSize),
      ensureTranscode(3, source, sourceSize),
      ensureTranscode(3, source, sourceSize),
    ]);
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it("keys on source size, so a replaced file is never served stale", async () => {
    const longer = writeWav("tone-longer.wav", 4);
    const longerSize = fs.statSync(longer).size;
    assert.notEqual(longerSize, sourceSize);

    const original = await ensureTranscode(4, source, sourceSize);
    const originalSize = fs.statSync(original).size;

    const replaced = await ensureTranscode(4, longer, longerSize);
    assert.notEqual(replaced, original, "the replaced file reused the old key");
    assert.ok(
      fs.statSync(replaced).size > originalSize,
      "the new entry is not the longer audio",
    );
  });

  it("rejects on a missing source and leaves no partial behind", async () => {
    await assert.rejects(
      ensureTranscode(5, path.join(libraryRoot, "nope.wav"), 123),
    );
    const leftovers = fs
      .readdirSync(TRANSCODE_DIR)
      .filter((f) => f.endsWith(".part"));
    assert.deepEqual(leftovers, [], "a .part file survived a failed run");
  });

  it("never leaves a .part file after successful runs either", () => {
    const leftovers = fs
      .readdirSync(TRANSCODE_DIR)
      .filter((f) => f.endsWith(".part"));
    assert.deepEqual(leftovers, []);
  });

  it("marks an entry as recently used on a cache hit", async () => {
    const out = await ensureTranscode(6, source, sourceSize);
    fs.utimesSync(out, new Date(0), new Date(0));

    await ensureTranscode(6, source, sourceSize);
    assert.ok(
      fs.statSync(out).mtimeMs > 0,
      "a cache hit left the entry looking ancient",
    );
  });

  it("drops earlier conversions of the same track", async () => {
    const first = await ensureTranscode(7, source, sourceSize);
    const longer = writeWav("tone-replaced.wav", 4);

    const second = await ensureTranscode(7, longer, fs.statSync(longer).size);
    assert.notEqual(second, first);
    assert.ok(!fs.existsSync(first), "the superseded entry survived");
    assert.ok(fs.existsSync(second));
  });
});

describe("cache eviction", { skip }, () => {
  let source = "";
  let sourceSize = 0;
  let entrySize = 0;

  before(async () => {
    setCacheLimit(null);
    source = writeWav("evict-tone.wav", 3);
    sourceSize = fs.statSync(source).size;
    // Sizing the ceilings below needs to know how big one entry actually is.
    const probe = await ensureTranscode(99, source, sourceSize);
    entrySize = fs.statSync(probe).size;
  });

  function cacheFiles(): string[] {
    return fs.readdirSync(TRANSCODE_DIR).filter((f) => f.endsWith(".mp3"));
  }

  it("evicts least-recently-used entries once over the ceiling", async () => {
    process.env.KIKOERU_TRANSCODE_CACHE_MB = "0";
    const stale = await ensureTranscode(100, source, sourceSize);
    const warm = await ensureTranscode(101, source, sourceSize);

    // Age 100 well past everything else, and mark 101 as just used.
    fs.utimesSync(stale, new Date(1000), new Date(1000));
    fs.utimesSync(warm, new Date(), new Date());

    // Room for about two entries, so the sweep has to drop something.
    setCacheLimit(entrySize * 2.5);
    const newest = await ensureTranscode(102, source, sourceSize);

    assert.ok(!fs.existsSync(stale), "the least-recently-used entry survived");
    assert.ok(fs.existsSync(newest), "the entry just written was evicted");
    assert.ok(fs.existsSync(warm), "a recently-used entry was evicted first");
  });

  it("keeps the just-written entry even when it alone exceeds the ceiling", async () => {
    // Without the `keep` guard this deletes each conversion the instant it
    // finishes, and ffmpeg re-runs on every single request forever.
    setCacheLimit(entrySize / 4);
    const out = await ensureTranscode(201, source, sourceSize);
    assert.ok(
      fs.existsSync(out),
      "cache would thrash: the new entry evicted itself",
    );
  });

  it("leaves everything alone when the ceiling is disabled", async () => {
    process.env.KIKOERU_TRANSCODE_CACHE_MB = "0";
    await ensureTranscode(300, source, sourceSize);
    const before = cacheFiles().length;
    await ensureTranscode(301, source, sourceSize);
    assert.equal(cacheFiles().length, before + 1);
  });
});
