import "server-only";
import MiniSearch from "minisearch";
import { sqlite } from "../db/client";
import { phoneticForms } from "./transliterate";

export type SuggestionType = "seiyuu" | "circle" | "tag" | "work";

export interface IndexedDoc {
  /** Composite id: `${type}:${rawId}` so MiniSearch can disambiguate. */
  id: string;
  type: SuggestionType;
  /** Numeric id (seiyuu/circle/tag) or string id (work RJ code). */
  refId: string;
  name: string;
  nameEn?: string;
  /** Phonetic forms generated at index time. */
  hiragana?: string;
  romaji?: string;
  /** Auxiliary searchable text (e.g. circle name for a work). */
  context?: string;
  /** Used for ranking ties (more works = more likely). */
  workCount: number;
}

interface BuildResult {
  index: MiniSearch<IndexedDoc>;
  docs: Map<string, IndexedDoc>;
  builtAt: number;
  size: number;
}

let cache: BuildResult | null = null;
let inFlight: Promise<BuildResult> | null = null;

function tokenize(text: string): string[] {
  if (!text) return [];
  // Split on whitespace + punctuation. For CJK runs (which have no spaces),
  // also emit each character + sliding bigrams so partial typing matches.
  const out: string[] = [];
  const chunks = text
    .toLowerCase()
    .split(/[\s,.;:!?'"`~()\[\]{}<>/\\\-_=+*&^%$#@|]+/u)
    .filter(Boolean);
  for (const chunk of chunks) {
    out.push(chunk);
    if (/[぀-ヿ㐀-鿿]/.test(chunk) && chunk.length > 1) {
      for (let i = 0; i < chunk.length; i++) out.push(chunk[i]);
      for (let i = 0; i < chunk.length - 1; i++) out.push(chunk.slice(i, i + 2));
    }
  }
  return out;
}

function createIndex(): MiniSearch<IndexedDoc> {
  return new MiniSearch<IndexedDoc>({
    idField: "id",
    fields: ["name", "nameEn", "hiragana", "romaji", "context"],
    storeFields: ["type", "refId", "name", "nameEn", "context", "workCount"],
    tokenize,
    processTerm: (term) => term.toLowerCase(),
    searchOptions: {
      prefix: true,
      fuzzy: 0.25,
      combineWith: "AND",
    },
  });
}

async function build(): Promise<BuildResult> {
  const index = createIndex();
  const docs = new Map<string, IndexedDoc>();

  type Row = {
    id: number | string;
    name: string;
    name_en: string | null;
    work_count: number;
  };

  const seiyuuRows = sqlite
    .prepare(
      `SELECT va.id, va.name, va.name_en, COUNT(wva.work_id) AS work_count
       FROM voice_actors va
       LEFT JOIN work_voice_actors wva ON wva.voice_actor_id = va.id
       GROUP BY va.id
       HAVING work_count > 0`,
    )
    .all() as Row[];

  const circleRows = sqlite
    .prepare(
      `SELECT c.id, c.name, c.name_en, COUNT(w.id) AS work_count
       FROM circles c
       LEFT JOIN works w ON w.circle_id = c.id
       GROUP BY c.id
       HAVING work_count > 0`,
    )
    .all() as Row[];

  const tagRows = sqlite
    .prepare(
      `SELECT t.id, t.name, t.name_en, COUNT(wt.work_id) AS work_count
       FROM tags t
       LEFT JOIN work_tags wt ON wt.tag_id = t.id
       GROUP BY t.id
       HAVING work_count > 0`,
    )
    .all() as Row[];

  const workRows = sqlite
    .prepare(
      `SELECT w.id, w.title AS name, w.title_kana AS name_en,
              COALESCE(c.name, '') AS context, 1 AS work_count
       FROM works w
       LEFT JOIN circles c ON c.id = w.circle_id`,
    )
    .all() as Array<Row & { context: string }>;

  async function add(
    type: SuggestionType,
    rows: Array<{ id: number | string; name: string; name_en?: string | null; context?: string; work_count: number }>,
  ) {
    // Process in parallel batches so kuroshiro init is amortized.
    const BATCH = 32;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const built = await Promise.all(
        slice.map(async (r) => {
          const refId = String(r.id);
          const phon = await phoneticForms(r.name);
          const doc: IndexedDoc = {
            id: `${type}:${refId}`,
            type,
            refId,
            name: r.name,
            nameEn: r.name_en ?? undefined,
            hiragana: phon.hiragana,
            romaji: phon.romaji,
            context: r.context,
            workCount: r.work_count,
          };
          return doc;
        }),
      );
      for (const d of built) {
        docs.set(d.id, d);
      }
      index.addAll(built);
    }
  }

  const t0 = Date.now();
  await add("seiyuu", seiyuuRows);
  await add("circle", circleRows);
  await add("tag", tagRows);
  await add(
    "work",
    workRows.map((r) => ({ ...r, context: r.context })),
  );
  const elapsed = Date.now() - t0;

  const size = seiyuuRows.length + circleRows.length + tagRows.length + workRows.length;
  console.log(`[search] index built: ${size} docs in ${elapsed}ms`);

  return { index, docs, builtAt: Date.now(), size };
}

export async function getSearchIndex(): Promise<BuildResult> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = build().then((res) => {
    cache = res;
    inFlight = null;
    return res;
  });
  return inFlight;
}

export function invalidateSearchIndex() {
  cache = null;
  inFlight = null;
}

/** Field-weight boosts giving seiyuu/circle priority over tags/works. */
const TYPE_WEIGHTS: Record<SuggestionType, number> = {
  seiyuu: 2.5,
  circle: 2.2,
  tag: 1.2,
  work: 1.0,
};

export interface Suggestion {
  type: SuggestionType;
  id: string;
  name: string;
  context?: string;
  workCount: number;
  score: number;
}

export async function searchSuggestions(
  rawQuery: string,
  limit = 12,
): Promise<Suggestion[]> {
  const { normalizeQuery } = await import("./transliterate");
  const q = normalizeQuery(rawQuery);
  if (!q.raw) return [];

  const { index, docs } = await getSearchIndex();

  // Build a multi-term query: original + romaji + hiragana variants.
  // MiniSearch's search() accepts a string; we run multiple searches and merge.
  const variants = new Set<string>();
  variants.add(q.raw);
  if (q.romaji && q.romaji !== q.raw) variants.add(q.romaji);
  if (q.hiragana) variants.add(q.hiragana);

  const merged = new Map<string, { doc: IndexedDoc; score: number }>();
  for (const v of variants) {
    const hits = index.search(v, {
      prefix: true,
      fuzzy: 0.3,
      boost: { name: 3, hiragana: 2.5, romaji: 2, nameEn: 2, context: 0.5 },
    });
    for (const h of hits) {
      const doc = docs.get(String(h.id));
      if (!doc) continue;
      const weighted = h.score * TYPE_WEIGHTS[doc.type];
      const prev = merged.get(doc.id);
      if (!prev || weighted > prev.score) {
        merged.set(doc.id, { doc, score: weighted });
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score || b.doc.workCount - a.doc.workCount)
    .slice(0, limit)
    .map(({ doc, score }) => ({
      type: doc.type,
      id: doc.refId,
      name: doc.name,
      context: doc.context,
      workCount: doc.workCount,
      score,
    }));
}
