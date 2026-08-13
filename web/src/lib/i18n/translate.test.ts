import { test } from "node:test";
import assert from "node:assert/strict";
import { makeT } from "./translate";
import { en, ja, type TranslationKey } from "./dictionaries";
import { LOCALES } from "./config";

// ---------------------------------------------------------------------------
// Lookup and interpolation
// ---------------------------------------------------------------------------

test("resolves a key in each language", () => {
  assert.equal(makeT("en")("nav.library"), "Library");
  assert.equal(makeT("ja")("nav.library"), ja["nav.library"]);
});

test("fills {placeholders} from vars", () => {
  const t = makeT("en");
  assert.equal(
    t("scan.log.tracks", { count: 3 }),
    en["scan.log.tracks"].replace("{count}", "3"),
  );
});

test("leaves a placeholder in place when no var is supplied", () => {
  // Better a visible `{count}` than a blank where a number should be.
  const t = makeT("en");
  assert.match(t("scan.log.tracks", { other: 1 }), /\{count\}/);
});

test("substitutes every occurrence and coerces numbers", () => {
  const t = makeT("en");
  const out = t("scan.log.doneWorks", {
    found: 2,
    added: 1,
    skipped: 0,
    tracks: 40,
    meta: 2,
    errors: 0,
  });
  assert.doesNotMatch(out, /\{/, "no placeholder should survive");
  assert.match(out, /\b2\b/);
});

test("falls back to the key itself when a string is missing", () => {
  const t = makeT("en");
  assert.equal(t("does.not.exist" as TranslationKey), "does.not.exist");
});

test("falls back to the default locale for an unknown locale", () => {
  // @ts-expect-error — deliberately passing a locale outside the union.
  const t = makeT("de");
  assert.equal(typeof t("nav.library"), "string");
  assert.notEqual(t("nav.library"), "nav.library");
});

// ---------------------------------------------------------------------------
// Pluralisation
// ---------------------------------------------------------------------------

test("count of 1 selects the _one variant when one exists", () => {
  const singularKeys = (Object.keys(en) as TranslationKey[]).filter((k) =>
    k.endsWith("_one"),
  );
  assert.ok(singularKeys.length > 0, "expected some _one keys to exist");

  for (const singular of singularKeys) {
    const base = singular.slice(0, -"_one".length) as TranslationKey;
    const t = makeT("en");
    assert.equal(t(base, { count: 1 }), en[singular].replace("{count}", "1"));
    assert.notEqual(t(base, { count: 2 }), t(base, { count: 1 }));
  }
});

test("any other count keeps the base string", () => {
  const t = makeT("en");
  const base = (Object.keys(en) as TranslationKey[]).find((k) =>
    k.endsWith("_one"),
  );
  assert.ok(base);
  const plural = base.slice(0, -"_one".length) as TranslationKey;
  for (const count of [0, 2, 11]) {
    assert.equal(
      t(plural, { count }),
      en[plural].replace(/\{count\}/g, String(count)),
    );
  }
});

// ---------------------------------------------------------------------------
// Dictionary health — these catch a half-finished translation at test time
// rather than as a stray English string in the Japanese UI.
// ---------------------------------------------------------------------------

test("every locale in LOCALES has a dictionary", () => {
  const dicts: Record<string, Record<string, string>> = { en, ja };
  for (const locale of LOCALES) {
    assert.ok(dicts[locale], `no dictionary for ${locale}`);
  }
});

test("en and ja define exactly the same keys", () => {
  const enKeys = Object.keys(en).sort();
  const jaKeys = Object.keys(ja).sort();

  const missingInJa = enKeys.filter((k) => !(k in ja));
  const extraInJa = jaKeys.filter((k) => !(k in en));

  assert.deepEqual(missingInJa, [], "keys missing from ja");
  assert.deepEqual(extraInJa, [], "keys in ja that en does not have");
});

/**
 * Sentence fragments that wrap an inline element (`{before}<code/>{after}`)
 * can legitimately be empty in one language when its word order puts the
 * element first. Anything not listed here being blank is an oversight.
 */
const INTENTIONALLY_EMPTY = new Set([
  // Japanese leads with the RJ code — "RJ123456 のような名前のフォルダーを…" —
  // so nothing precedes it.
  "ja:library.empty.before",
  // Likewise, the work title opens the delete confirmation: "〈title〉（{id}）を…".
  "ja:delete.before",
]);

test("no string is unintentionally blank", () => {
  for (const [name, dict] of Object.entries({ en, ja })) {
    for (const [key, value] of Object.entries(dict)) {
      if (INTENTIONALLY_EMPTY.has(`${name}:${key}`)) {
        assert.equal(value, "", `${name}.${key} is listed as intentionally empty but is not`);
        continue;
      }
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `${name}.${key} is blank`,
      );
    }
  }
});

test("translations use the same placeholders as their English source", () => {
  const placeholders = (s: string) =>
    (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");

  for (const key of Object.keys(en) as TranslationKey[]) {
    assert.equal(
      placeholders(ja[key]),
      placeholders(en[key]),
      `placeholder mismatch on "${key}"`,
    );
  }
});

test("a key with a _one variant has one in both languages", () => {
  for (const key of Object.keys(en)) {
    if (!key.endsWith("_one")) continue;
    assert.ok(key in ja, `ja is missing the singular "${key}"`);
    const base = key.slice(0, -"_one".length);
    assert.ok(base in en, `"${key}" has no base string "${base}"`);
  }
});
