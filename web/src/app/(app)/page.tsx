import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { WorkCard } from "@/components/work-card";
import {
  listWorksFiltered,
  listAllTags,
  listAllVoiceActors,
  listAllCircles,
  listRecentlyPlayedWorks,
} from "@/lib/db/queries";
import {
  TagFilter,
  VoiceActorFilter,
  CircleFilter,
  SortPicker,
  ActiveFilters,
} from "./_filters";
import { LibraryGridSize } from "./_library-grid";
import { OnDeck } from "@/components/on-deck";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  tags?: string;
  va?: string;
  circles?: string;
  sort?: "title" | "release" | "added";
  dir?: "asc" | "desc";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const parseIds = (v?: string) =>
    v?.split(",").map((s) => parseInt(s, 10)).filter(Number.isFinite) ?? [];
  const tagIds = parseIds(sp.tags);
  const vaIds = parseIds(sp.va);
  const circleIds = parseIds(sp.circles);

  const hasFilters =
    Boolean(sp.q?.trim()) ||
    tagIds.length > 0 ||
    vaIds.length > 0 ||
    circleIds.length > 0;
  const recent = hasFilters ? [] : listRecentlyPlayedWorks(8);

  const [works, allTags, allVAs, allCircles] = await Promise.all([
    Promise.resolve(
      listWorksFiltered({
        q: sp.q,
        tagIds,
        voiceActorIds: vaIds,
        circleIds,
        sort: sp.sort ?? "added",
        dir: sp.dir,
        limit: 200,
      }),
    ),
    Promise.resolve(listAllTags()),
    Promise.resolve(listAllVoiceActors()),
    Promise.resolve(listAllCircles()),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight">
          Library
        </h1>
        <div className="flex items-center gap-2">
          <SortPicker current={sp.sort ?? "added"} dir={sp.dir} />
          <Sheet>
            <SheetTrigger
              render={<Button variant="outline" size="sm" className="gap-1.5" />}
            >
              <Filter className="h-4 w-4" />
              Filters
              {(tagIds.length > 0 ||
                vaIds.length > 0 ||
                circleIds.length > 0) && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {tagIds.length + vaIds.length + circleIds.length}
                </span>
              )}
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 p-4">
                <section>
                  <h3 className="mb-2 text-sm font-medium">Voice actors / 声優</h3>
                  <VoiceActorFilter
                    items={allVAs}
                    selected={vaIds}
                  />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">Circles / サークル</h3>
                  <CircleFilter items={allCircles} selected={circleIds} />
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">Tags / ジャンル</h3>
                  <TagFilter items={allTags} selected={tagIds} />
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
      />

      <p className="mb-4 text-sm text-muted-foreground">{works.length} works</p>

      {recent.length > 0 && <OnDeck works={recent} />}

      {works.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <p className="text-lg font-medium">No works yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop folders named like <code className="rounded bg-muted px-1.5 py-0.5">RJ123456</code> into your library directory, then click the refresh button in the top bar to scan.
          </p>
        </div>
      ) : (
        <LibraryGridSize>
          {works.map((w) => (
            <WorkCard key={w.id} work={w} />
          ))}
        </LibraryGridSize>
      )}
    </div>
  );
}
