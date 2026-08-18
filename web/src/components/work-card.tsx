import Link from "next/link";
import { FileArchive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { coverSrc } from "@/lib/cover";
import { cn } from "@/lib/utils";
import { archiveLabel } from "@/lib/metadata/types";
import type { WorkSummary } from "@/lib/db/queries";

export function WorkCard({ work }: { work: WorkSummary }) {
  const vaShown = work.voiceActors.slice(0, 3);
  const vaExtra = work.voiceActors.length - vaShown.length;
  const tagShown = work.tags.slice(0, 3);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
        // Still packed: tinted so it reads as "there is nothing to play here
        // yet" at a glance in the grid.
        work.isArchive && "border-destructive/30 bg-destructive/10",
      )}
    >
      <Link
        href={`/works/${work.id}`}
        data-nsfw-cover={work.nsfw ? "true" : undefined}
        className="relative block aspect-[4/3] overflow-hidden bg-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverSrc({
            id: work.id,
            coverUrl: work.coverUrl,
            hasLocalCover: work.hasLocalCover,
          })}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {work.nsfw && (
          <Badge
            variant="destructive"
            className="absolute right-2 top-2 backdrop-blur"
          >
            R18
          </Badge>
        )}
        {work.isArchive && work.archiveName && (
          <Badge
            variant="destructive"
            title={work.archiveName}
            className="absolute left-2 top-2 gap-1 backdrop-blur"
          >
            <FileArchive className="h-3 w-3" />
            {archiveLabel(work.archiveName)}
          </Badge>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-2 bottom-2 text-white">
          <p
            title={work.title}
            className="line-clamp-2 text-sm font-medium drop-shadow"
          >
            {work.title}
          </p>
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {work.circleName && (
          <Link
            href={`/works/${work.id}`}
            className="truncate text-xs text-muted-foreground hover:text-foreground"
          >
            {work.circleName}
          </Link>
        )}
        {vaShown.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {vaShown.map((va) => (
              <Link
                key={va.id}
                href={`/?va=${va.id}`}
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground transition-colors hover:bg-primary/15 hover:text-foreground"
              >
                {va.name}
              </Link>
            ))}
            {vaExtra > 0 && (
              <span className="self-center text-[10px] text-muted-foreground">
                +{vaExtra}
              </span>
            )}
          </div>
        )}
        {tagShown.length > 0 && (
          // Hidden by CSS when the appearance setting is on; see globals.css.
          <div data-work-tags className="flex flex-wrap gap-1">
            {tagShown.map((t) => (
              <Link
                key={t.id}
                href={`/?tags=${t.id}`}
                className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
