import "server-only";
import path from "node:path";
import fs from "node:fs";
import KuroshiroMod from "kuroshiro";
import KuromojiAnalyzerMod from "kuroshiro-analyzer-kuromoji";
import * as wanakana from "wanakana";

// CJS/ESM interop: depending on the runtime, the class may be the default
// export, or nested under `.default.default`. Resolve both shapes.
const Kuroshiro =
  ((KuroshiroMod as unknown as { default?: typeof KuroshiroMod }).default ??
    KuroshiroMod) as typeof KuroshiroMod;
const KuromojiAnalyzer =
  ((KuromojiAnalyzerMod as unknown as { default?: typeof KuromojiAnalyzerMod })
    .default ?? KuromojiAnalyzerMod) as typeof KuromojiAnalyzerMod;

type KuroshiroInstance = InstanceType<typeof Kuroshiro>;

let kuroshiroPromise: Promise<KuroshiroInstance | null> | null = null;

/**
 * Locate kuromoji's `dict/` directory by walking node_modules. We avoid
 * `require.resolve("kuromoji/...")` because Turbopack statically traces those
 * literals and fails to bundle (kuromoji ships ~13MB of dict files and is
 * loaded at runtime only — listed in `serverExternalPackages`).
 */
function resolveKuromojiDictPath(): string {
  const candidates: string[] = [];
  const cwd = process.cwd();
  // Direct hoist (npm/yarn classic):
  candidates.push(path.join(cwd, "node_modules", "kuromoji", "dict"));
  // Nested under the analyzer (npm with conflicts):
  candidates.push(
    path.join(
      cwd,
      "node_modules",
      "kuroshiro-analyzer-kuromoji",
      "node_modules",
      "kuromoji",
      "dict",
    ),
  );
  // pnpm: scan .pnpm/kuromoji@*/node_modules/kuromoji/dict
  const pnpmDir = path.join(cwd, "node_modules", ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    try {
      for (const entry of fs.readdirSync(pnpmDir)) {
        if (entry.startsWith("kuromoji@")) {
          candidates.push(
            path.join(pnpmDir, entry, "node_modules", "kuromoji", "dict"),
          );
        }
      }
    } catch {
      /* ignore */
    }
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `[search] kuromoji dict not found. Tried:\n  ${candidates.join("\n  ")}`,
  );
}

async function loadKuroshiro(): Promise<KuroshiroInstance | null> {
  try {
    const k = new Kuroshiro();
    const analyzer = new KuromojiAnalyzer({ dictPath: resolveKuromojiDictPath() });
    await k.init(analyzer);
    return k;
  } catch (err) {
    console.error("[search] kuroshiro init failed; romaji conversion disabled", err);
    return null;
  }
}

function getKuroshiro(): Promise<KuroshiroInstance | null> {
  if (!kuroshiroPromise) kuroshiroPromise = loadKuroshiro();
  return kuroshiroPromise;
}

const HAS_KANJI = /[㐀-鿿]/;
const HAS_KATAKANA = /[゠-ヿ]/;
const HAS_HIRAGANA = /[぀-ゟ]/;
const HAS_JP = /[぀-ヿ㐀-鿿]/;

export interface PhoneticForms {
  hiragana?: string;
  romaji?: string;
}

/**
 * Produce hiragana + romaji renderings for a Japanese string.
 * - Pure kana → wanakana (fast path, no morphological analyzer needed)
 * - Anything with kanji → kuroshiro (heavy but accurate)
 */
export async function phoneticForms(input: string): Promise<PhoneticForms> {
  if (!input) return {};
  const trimmed = input.trim();
  if (!trimmed) return {};

  if (!HAS_JP.test(trimmed)) {
    // Already latin — return romaji as-is (lowercased) so it indexes uniformly.
    return { romaji: trimmed.toLowerCase() };
  }

  if (!HAS_KANJI.test(trimmed)) {
    // Pure kana: wanakana handles this without the dictionary load.
    const hira = HAS_KATAKANA.test(trimmed) ? wanakana.toHiragana(trimmed) : trimmed;
    const romaji = wanakana.toRomaji(trimmed).toLowerCase();
    return { hiragana: hira, romaji };
  }

  const k = await getKuroshiro();
  if (!k) return {};
  try {
    // `spaced` mode inserts a space between morphemes so the resulting tokens
    // (e.g. "akiyama haruru" instead of "akiyamaharuru") match by prefix on
    // either piece. We keep both the spaced form and a no-space form so a
    // user typing the full romanization without spaces still matches.
    const hiraSpaced = await k.convert(trimmed, { to: "hiragana", mode: "spaced" });
    const romSpaced = await k.convert(trimmed, { to: "romaji", mode: "spaced", romajiSystem: "hepburn" });
    const hiraJoined = hiraSpaced ? hiraSpaced.replace(/\s+/g, "") : "";
    const romJoined = romSpaced ? romSpaced.replace(/\s+/g, "") : "";
    const hiragana = [hiraSpaced, hiraJoined].filter(Boolean).join(" ");
    const romaji = [romSpaced, romJoined].filter(Boolean).join(" ").toLowerCase();
    return {
      hiragana: hiragana || undefined,
      romaji: romaji || undefined,
    };
  } catch (err) {
    console.warn("[search] convert failed for", trimmed, err);
    return {};
  }
}

/**
 * Normalize a user query for searching. We always produce both hiragana and
 * romaji variants so the search index (which stores both) hits regardless of
 * how the user typed it.
 */
export function normalizeQuery(q: string): {
  raw: string;
  hiragana?: string;
  romaji?: string;
} {
  const raw = q.trim();
  if (!raw) return { raw };

  if (HAS_JP.test(raw)) {
    // Japanese query — derive hiragana (from katakana) and romaji for matching.
    const hira = HAS_HIRAGANA.test(raw) || HAS_KATAKANA.test(raw)
      ? wanakana.toHiragana(raw)
      : undefined;
    const rom = hira ? wanakana.toRomaji(hira).toLowerCase() : undefined;
    return { raw, hiragana: hira, romaji: rom };
  }

  // Latin query — treat as romaji; also derive hiragana so it can match
  // hiragana-indexed strings via fuzzy/prefix.
  const lower = raw.toLowerCase();
  let hira: string | undefined;
  try {
    hira = wanakana.toHiragana(lower, { passRomaji: true });
  } catch {
    hira = undefined;
  }
  return { raw: lower, romaji: lower, hiragana: hira };
}
