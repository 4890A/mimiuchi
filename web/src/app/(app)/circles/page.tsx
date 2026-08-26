import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listAllCirclesWithRecentWorks } from "@/lib/db/queries";
import { coverSrc, hasCover } from "@/lib/cover";
import { CoverPlaceholder } from "@/components/cover-placeholder";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface SearchParams {
  sort?: "works" | "name";
}

export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { t } = await getTranslations();
  const sort = sp.sort ?? "works";
  const all = await Promise.resolve(listAllCirclesWithRecentWorks());
  const sorted = all.filter((c) => c.workCount > 0);
  if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  else sorted.sort((a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name, "ja"));

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("circles.title")}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {sorted.length}
          </span>
        </h1>
        <div className="flex gap-1 text-xs">
          <SortLink current={sort} value="works">{t("sort.byWorks")}</SortLink>
          <SortLink current={sort} value="name">{t("sort.byName")}</SortLink>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center text-sm text-muted-foreground">
          {t("circles.empty")}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((c) => (
            <li key={c.id}>
              <Link
                href={`/?circles=${c.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="grid aspect-[2/1] grid-cols-2 grid-rows-2 gap-px bg-muted">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const w = c.recentWorks[i];
                    if (!w) {
                      return <div key={i} className="bg-muted" />;
                    }
                    return (
                      <div
                        key={i}
                        data-nsfw-cover={w.nsfw ? "true" : undefined}
                        className="relative overflow-hidden bg-muted"
                      >
                        {hasCover(w) ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={coverSrc({
                              id: w.id,
                              coverUrl: w.coverUrl,
                              hasLocalCover: w.hasLocalCover,
                            })}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <CoverPlaceholder />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {c.workCount}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SortLink({
  current,
  value,
  children,
}: {
  current: string;
  value: string;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <Link
      href={`/circles?sort=${value}`}
      className={
        "rounded-md px-2.5 py-1 font-medium transition-colors " +
        (active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60")
      }
    >
      {children}
    </Link>
  );
}
