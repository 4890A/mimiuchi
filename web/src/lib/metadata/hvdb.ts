import type { NormalizedWork } from "./types";

const HVDB_URL = (id: string) =>
  `https://hvdb.me/Dashboard/WorkDetails/${id.replace(/^RJ/i, "")}`;

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
};

function extract(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim();
}

function extractAll(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = g.exec(html)) !== null) {
    const v = m[1]?.trim();
    if (v) out.push(v);
  }
  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function fetchFromHvdb(
  id: string,
): Promise<NormalizedWork | null> {
  const res = await fetch(HVDB_URL(id), { headers: HEADERS, cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();

  const ogTitle = extract(
    html,
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
  );
  const title = ogTitle ? decodeEntities(ogTitle) : undefined;
  if (!title || /^Work Details/i.test(title)) return null;

  const ogImage = extract(
    html,
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
  );

  const circleName = extract(html, /Circle:\s*<[^>]+>([^<]+)</i);
  const voiceActors = extractAll(
    html,
    /CV:[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi,
  ).map((name) => ({ name }));
  const tags = extractAll(html, /<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/gi).map(
    (name) => ({ name }),
  );

  return {
    id,
    title,
    circleName,
    voiceActors,
    tags,
    coverUrl: ogImage,
    dlsiteUrl: `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`,
    source: "hvdb",
  };
}
