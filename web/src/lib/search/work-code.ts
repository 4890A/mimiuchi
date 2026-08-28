/**
 * Work ids as search terms.
 *
 * A work's id is the thing people actually have to hand — it is in the folder
 * name, in the DLsite URL, in whatever list they are working from — so it has to
 * be searchable. It is not a word, though, and treating it as one goes wrong in
 * both directions: the raw id alone misses the way people write it, and fuzzy
 * matching over a library of near-identical numeric ids buries the exact hit
 * under every neighbour within a few digits of it.
 *
 * Deliberately free of `server-only` and of any database import, so the rules
 * below can be tested on their own.
 */

/** DLsite ids: an `RJ`/`VJ`/`BJ` prefix and a run of digits. */
const CODE_ID = /^(rj|vj|bj)(\d+)$/;

/** Separators someone might type or paste inside an id. */
const SEPARATORS = /[\s_-]+/g;

/**
 * Every form of `workId` worth indexing, as one space-separated string — the
 * index tokenizer splits on whitespace, so each form becomes its own term.
 *
 * The forms exist because one work has several names in circulation:
 *
 * - the id itself, `rj236823`
 * - its digits alone, for anyone who has the number but not the prefix
 * - the zero-padded eight-digit id, `rj00236823`. DLsite answers to both, which
 *   is why the scanner probes both when it looks a work up, and someone copying
 *   an id off the site can arrive with either.
 *
 * A work with no DLsite id — a plain folder, whose id is a path hash — just
 * gets its id, which is all there is.
 */
export function workCodeForms(workId: string): string {
  const id = workId.toLowerCase();
  const forms = new Set<string>([id]);

  const m = CODE_ID.exec(id);
  if (m) {
    const [, prefix, digits] = m;
    forms.add(digits);
    // Leading zeros are padding, not part of the number.
    const bare = digits.replace(/^0+/, "");
    if (bare) forms.add(bare);
    if (bare.length < 8) {
      const padded = bare.padStart(8, "0");
      forms.add(`${prefix}${padded}`);
      forms.add(padded);
    }
  }

  return [...forms].join(" ");
}

/**
 * Does this query read as someone reaching for a specific work id rather than
 * describing something?
 *
 * Answering yes turns fuzzy matching off for the query, so `RJ01678210` returns
 * that work instead of it plus every id within three digits of it. The bar for
 * a bare number is higher than for a prefixed one: `rj123` is unambiguous, `123`
 * is more likely part of a title.
 */
export function isWorkCodeQuery(rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase().replace(SEPARATORS, "");
  if (!q) return false;
  if (/^(rj|vj|bj)\d*$/.test(q)) return true;
  return /^\d{6,8}$/.test(q);
}
