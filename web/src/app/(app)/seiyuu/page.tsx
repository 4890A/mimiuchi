import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listAllVoiceActors } from "@/lib/db/queries";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface SearchParams {
  sort?: "works" | "name";
}

export default async function SeiyuuPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { t } = await getTranslations();
  const sort = sp.sort ?? "works";
  const all = await Promise.resolve(listAllVoiceActors());
  const sorted = [...all].filter((v) => v.workCount > 0);
  if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  else sorted.sort((a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name, "ja"));

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("seiyuu.title")}
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
          {t("seiyuu.empty")}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((va) => (
            <li key={va.id}>
              <Link
                href={`/?va=${va.id}`}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-secondary"
              >
                <span className="truncate">
                  {va.name}
                  {va.nameEn && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {va.nameEn}
                    </span>
                  )}
                </span>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {va.workCount}
                </Badge>
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
      href={`/seiyuu?sort=${value}`}
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
