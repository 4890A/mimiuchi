import { fetch as undiciFetch, type Dispatcher } from "undici";
import { coverBucket, type NormalizedWork } from "./types";

const ANNOUNCE_URL = (id: string) =>
  `https://www.dlsite.com/maniax/api/=/product.json?workno=${id}`;

const PRODUCT_URL = (id: string) =>
  `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`;

const COMMON_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.5",
  Cookie: "adultchecked=1; locale=ja-jp",
};

interface DlsiteRawWork {
  workno: string;
  work_name: string;
  work_name_kana?: string;
  maker_name?: string;
  maker_name_en?: string;
  maker_id?: string;
  regist_date?: string;
  age_category?: number;
  age_category_string?: string;
  work_type?: string;
  work_type_string?: string;
  intro_s?: string;
  intro?: string;
  options?: string;
  image_main?: { url?: string; relative_url?: string };
  image_thum?: { url?: string; relative_url?: string };
  image_samples?: Array<{ url?: string; relative_url?: string }>;
  genres?: Array<{ name?: string; name_en?: string; id?: number }>;
  creaters?: {
    voice_by?: Array<{ name?: string; name_en?: string; id?: string }>;
    scenario?: Array<{ name?: string; name_en?: string; id?: string }>;
    illust?: Array<{ name?: string; name_en?: string; id?: string }>;
    music?: Array<{ name?: string; name_en?: string; id?: string }>;
    others_by?: Array<{ name?: string; name_en?: string; id?: string }>;
  };
  language_editions?: Array<{ lang?: string; label?: string }>;
  default_point_rate?: number;
}

function fixUrl(u?: string): string | undefined {
  if (!u) return undefined;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  return u;
}

function classifyAge(raw?: number): NormalizedWork["ageRating"] {
  switch (raw) {
    case 1:
      return "all";
    case 2:
      return "r15";
    case 3:
      return "adult";
    default:
      return undefined;
  }
}

function fallbackCoverUrl(id: string): string {
  const bucket = coverBucket(id);
  return `https://img.dlsite.jp/modpub/images2/work/doujin/${bucket}/${id}_img_main.jpg`;
}

export async function fetchFromDlsite(
  id: string,
  dispatcher?: Dispatcher,
): Promise<NormalizedWork | null> {
  const res = await undiciFetch(ANNOUNCE_URL(id), {
    headers: COMMON_HEADERS,
    dispatcher,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || data.length === 0) return null;

  const w = data[0] as DlsiteRawWork;
  if (!w?.workno) return null;

  const voiceActors =
    w.creaters?.voice_by?.map((c) => ({
      name: (c.name ?? "").trim(),
      nameEn: c.name_en?.trim() || undefined,
    })).filter((c) => c.name) ?? [];

  const tags =
    w.genres?.map((g) => ({
      name: (g.name ?? "").trim(),
      nameEn: g.name_en?.trim() || undefined,
    })).filter((t) => t.name) ?? [];

  const coverUrl =
    fixUrl(w.image_main?.url ?? w.image_main?.relative_url) ??
    fallbackCoverUrl(id);
  const coverThumbUrl = fixUrl(
    w.image_thum?.url ?? w.image_thum?.relative_url,
  );

  return {
    id: w.workno,
    title: w.work_name,
    titleKana: w.work_name_kana || undefined,
    circleName: w.maker_name || undefined,
    circleNameEn: w.maker_name_en || undefined,
    releaseDate: w.regist_date?.slice(0, 10),
    ageRating: classifyAge(w.age_category),
    workType: w.work_type_string || w.work_type || undefined,
    description: w.intro || w.intro_s || undefined,
    coverUrl,
    coverThumbUrl,
    dlsiteUrl: PRODUCT_URL(id),
    nsfw: w.age_category === 3,
    voiceActors,
    tags,
    source: "dlsite",
  };
}
