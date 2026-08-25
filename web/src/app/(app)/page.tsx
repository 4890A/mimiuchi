import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { WorkCard } from "@/components/work-card";
import {
  listWorksFiltered,
  listAllTags,
  listFacetsForWorks,
  listAllVoiceActors,
  listAllCircles,
  listRecentlyPlayedWorks,
  listRandomWorks,
  type OnlyOrExclude,
} from "@/lib/db/queries";
import {
  TagFilter,
  VoiceActorFilter,
  CircleFilter,
  SortPicker,
  ActiveFilters,
  TriStateFilter,
} from "./_filters";
import { LibraryGridSize } from "./_library-grid";
import { OnDeck } from "@/components/on-deck";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  tags?: string;
  va?: string;
  circles?: string;
  r18?: string;
  zip?: string;
  sort?: "title" | "release" | "added";
  dir?: "asc" | "desc";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { t } = await getTranslations();
  const parseIds = (v?: string) =>
    v?.split(",").map((s) => parseInt(s, 10)).filter(Number.isFinite) ?? [];
  const tagIds = parseIds(sp.tags);
  const vaIds = parseIds(sp.va);
  const circleIds = parseIds(sp.circles);
  const parseTriState = (v?: string): OnlyOrExclude | undefined =>
    v === "only" || v === "exclude" ? v : undefined;
  const nsfw = parseTriState(sp.r18);
  const archive = parseTriState(sp.zip);

  const hasFilters =
    Boolean(sp.q?.trim()) ||
    tagIds.length > 0 ||
    vaIds.length > 0 ||
    circleIds.length > 0 ||
    Boolean(nsfw) ||
    Boolean(archive);
  const recent = hasFilters ? [] : listRecentlyPlayedWorks(8);
  const random = hasFilters ? [] : listRandomWorks(8);

  const works = await listWorksFiltered({
    q: sp.q,
    tagIds,
    voiceActorIds: vaIds,
    circleIds,
    nsfw,
    archive,
    sort: sp.sort,
    dir: sp.dir,
  });

  // What the filter menu offers, narrowed to the works actually showing: pick
  // a tag and the only tags left are the ones those works carry. `works` is
  // the complete filtered set — the page does not paginate — so its ids are
  // all this needs.
  const facets = listFacetsForWorks(works.map((w) => w.id));

  // The unfiltered lists stay, but only to label the chips below. A voice
  // actor or circle can narrow itself out of the menu, and the chip is then
  // the only way to deselect it — resolving names from `facets` would take
  // that away exactly when it is needed.
  const [allTags, allVAs, allCircles] = [
    listAllTags(),
    listAllVoiceActors(),
    listAllCircles(),
  ];

  // Passed to each card so its tag/seiyuu chips add to the current filters
  // rather than replacing them.
  const currentQuery = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();

  const activeFilterCount =
    tagIds.length +
    vaIds.length +
    circleIds.length +
    (nsfw ? 1 : 0) +
    (archive ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight">
          {t("library.title")}
        </h1>
        <div className="flex items-center gap-2">
          <SortPicker current={sp.sort ?? "added"} dir={sp.dir} />
          <Sheet>
            <SheetTrigger
              render={<Button variant="outline" size="sm" className="gap-1.5" />}
            >
              <Filter className="h-4 w-4" />
              {t("library.filters")}
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>{t("library.filters")}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 p-4">
                <section>
                  <h3 className="mb-2 text-sm font-medium">
                    {t("library.filter.r18")}
                  </h3>
                  <TriStateFilter
                    paramKey="r18"
                    value={nsfw}
                    labels={{
                      all: t("library.filter.all"),
                      only: t("library.filter.r18Only"),
                      exclude: t("library.filter.r18Exclude"),
                    }}
                  />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">
                    {t("library.filter.zip")}
                  </h3>
                  <TriStateFilter
                    paramKey="zip"
                    value={archive}
                    labels={{
                      all: t("library.filter.all"),
                      only: t("library.filter.zipOnly"),
                      exclude: t("library.filter.zipExclude"),
                    }}
                  />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">
                    {t("library.filter.voiceActors")}
                  </h3>
                  <VoiceActorFilter
                    items={facets.voiceActors}
                    selected={vaIds}
                  />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">
                    {t("library.filter.circles")}
                  </h3>
                  <CircleFilter items={facets.circles} selected={circleIds} />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">
                    {t("library.filter.tags")}
                  </h3>
                  <TagFilter items={facets.tags} selected={tagIds} />
                </section>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <ActiveFilters
        q={sp.q?.trim() || undefined}
        tags={allTags
          .filter((t) => tagIds.includes(t.id))
          .map((t) => ({ id: t.id, name: t.name }))}
        voiceActors={allVAs
          .filter((v) => vaIds.includes(v.id))
          .map((v) => ({ id: v.id, name: v.name }))}
        circles={allCircles
          .filter((c) => circleIds.includes(c.id))
          .map((c) => ({ id: c.id, name: c.name }))}
        nsfw={nsfw}
        archive={archive}
      />

      <p className="mb-4 text-sm text-muted-foreground">
        {t("library.workCount", { count: works.length })}
      </p>

      {recent.length > 0 && <OnDeck works={recent} initialRandom={random} />}

      {works.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <p className="text-lg font-medium">{t("library.empty.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("library.empty.before")}
            <code className="rounded bg-muted px-1.5 py-0.5">RJ123456</code>
            {t("library.empty.after")}
          </p>
        </div>
      ) : (
        <LibraryGridSize>
          {works.map((w) => (
            <WorkCard key={w.id} work={w} query={currentQuery} />
          ))}
        </LibraryGridSize>
      )}
    </div>
  );
}
