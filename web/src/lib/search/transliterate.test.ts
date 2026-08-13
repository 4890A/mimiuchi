import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeQuery, phoneticForms } from "./transliterate";

/**
 * Romanisation for the autocomplete index.
 *
 * `phoneticForms` runs at index time (once per entity), `normalizeQuery` at
 * query time (on every keystroke) — so the query side is deliberately the
 * cheap wanakana-only path and does *not* do morphological analysis. Several
 * tests below record where that asymmetry shows through; they describe what
 * the code does today rather than claiming it is ideal.
 *
 * The kanji tests load kuromoji's dictionary. That turns out to be fast
 * (~200 ms, cached process-wide after the first call), so they run by default.
 */

// ---------------------------------------------------------------------------
// normalizeQuery — synchronous, no dictionary
// ---------------------------------------------------------------------------

test("an empty or blank query yields only a raw field", () => {
  assert.deepEqual(normalizeQuery(""), { raw: "" });
  assert.deepEqual(normalizeQuery("   "), { raw: "" });
  assert.deepEqual(normalizeQuery("\t\n"), { raw: "" });
});

test("a latin query is lowercased and used as its own romaji", () => {
  const q = normalizeQuery("  Yostar  ");
  assert.equal(q.raw, "yostar", "trimmed and lowercased");
  assert.equal(q.romaji, "yostar");
});

test("latin queries are NOT converted to kana", () => {
  // `passRomaji: true` makes the hiragana derivation a no-op for pure latin
  // input, so "seia" does not become "せいあ". Latin still reaches kana-named
  // entities through the index's `romaji` field, which is why this is a
  // documented quirk rather than a bug — but the hiragana field is dead weight
  // for latin queries.
  const q = normalizeQuery("seia");
  assert.equal(q.hiragana, "seia");
  assert.notEqual(q.hiragana, "せいあ");
});

test("katakana is folded to hiragana and romanised", () => {
  const q = normalizeQuery("セイア");
  assert.equal(q.raw, "セイア", "raw keeps the original script");
  assert.equal(q.hiragana, "せいあ");
  assert.equal(q.romaji, "seia");
});

test("hiragana passes through and is romanised", () => {
  const q = normalizeQuery("せいあ");
  assert.equal(q.raw, "せいあ");
  assert.equal(q.hiragana, "せいあ");
  assert.equal(q.romaji, "seia");
});

test("a japanese query keeps its original case in raw", () => {
  // Only the latin branch lowercases; the search merges variants anyway.
  assert.equal(normalizeQuery("ブルーアーカイブ").raw, "ブルーアーカイブ");
});

test("a mixed latin/kanji query produces mangled variants but a usable raw", () => {
  // wanakana treats the latin run as romaji ("A" → "あ") and leaves kanji
  // alone, so neither derived form is meaningful here. The raw variant is what
  // actually matches, and searchSuggestions always queries raw as well.
  const q = normalizeQuery("ASMR癒し");
  assert.equal(q.raw, "ASMR癒し");
  assert.equal(q.hiragana, "あsmr癒し");
  assert.equal(q.romaji, "asmr癒shi");
});

test("normalizeQuery never throws on punctuation or emoji", () => {
  for (const input of ["!!!", "~~~", "🎧", "a/b\\c", "()[]"]) {
    assert.doesNotThrow(() => normalizeQuery(input), input);
  }
});

// ---------------------------------------------------------------------------
// phoneticForms — index-time, may use kuroshiro
// ---------------------------------------------------------------------------

test("blank input produces no forms", async () => {
  assert.deepEqual(await phoneticForms(""), {});
  assert.deepEqual(await phoneticForms("   "), {});
});

test("latin input is lowercased into romaji with no hiragana", async () => {
  assert.deepEqual(await phoneticForms("Yostar"), { romaji: "yostar" });
});

test("pure kana takes the wanakana fast path", async () => {
  assert.deepEqual(await phoneticForms("セイア"), {
    hiragana: "せいあ",
    romaji: "seia",
  });
  assert.deepEqual(await phoneticForms("せいあ"), {
    hiragana: "せいあ",
    romaji: "seia",
  });
});

test("the katakana long vowel mark expands to a vowel", async () => {
  // ブルーアーカイブ → ぶるうああかいぶ, so a user typing "buruaakaibu"
  // relies on fuzzy matching rather than an exact hit.
  const forms = await phoneticForms("ブルーアーカイブ");
  assert.equal(forms.hiragana, "ぶるうああかいぶ");
  assert.equal(forms.romaji, "buruuaakaibu");
});

test("kanji is analysed and emitted both spaced and joined", async () => {
  // Each form carries the morpheme-separated reading followed by the same
  // reading with the spaces removed, so both "taiyō to tsuki" and
  // "taiyōtotsuki" are indexed and either way of typing it hits.
  const forms = await phoneticForms("太陽と月");
  assert.equal(forms.hiragana, "たいよう と つき たいようとつき");
  assert.equal(forms.romaji, "taiyō to tsuki taiyōtotsuki");
});

test("hepburn romaji uses macrons for long vowels", async () => {
  // "taiyō", not "taiyou" — worth knowing, because a user typing "taiyou"
  // matches only via MiniSearch's fuzzy tolerance.
  const forms = await phoneticForms("太陽");
  assert.match(forms.romaji ?? "", /taiyō/);
});

test("characters kuromoji cannot read are left in place", async () => {
  // 﨑 (U+FA11, a compatibility ideograph) has no dictionary reading, so it
  // survives untranslated into the "romaji" field. Names spelled with these
  // variants are therefore only partly searchable by romaji.
  const forms = await phoneticForms("種﨑敦美");
  assert.match(forms.romaji ?? "", /﨑/, "unreadable kanji leaks into romaji");
  assert.match(forms.romaji ?? "", /atsumi/, "the readable part still converts");
});

test("repeated calls reuse the analyzer and stay consistent", async () => {
  const a = await phoneticForms("太陽と月");
  const b = await phoneticForms("太陽と月");
  assert.deepEqual(a, b);
});
