import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ExternalLink,
  Calendar,
  Disc,
  Globe,
  ShieldAlert,
  FileArchive,
  Tag as TagIcon,
} from "lucide-react";
import path from "node:path";
import { getWorkDetail } from "@/lib/db/queries";
import { coverSrc } from "@/lib/cover";
import { TrackList } from "@/components/track-row";
import { CoverLightbox } from "@/components/cover-lightbox";
import { AddTagButton } from "@/components/add-tag";
import { RevealFolderButton } from "@/components/reveal-folder-button";
import { DeleteWorkButton } from "@/components/delete-work-button";
import { EditWorkDialog } from "@/components/edit-work-dialog";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const work = await Promise.resolve(getWorkDetail(id));
  if (!work) notFound();
  const { t } = await getTranslations();

  const cover = coverSrc(
    {
      id: work.id,
      coverUrl: work.coverUrl,
      coverPath: work.coverPath,
      hasLocalCover: Boolean(work.coverPath),
    },
    work.coverVersion,
  );

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 -z-10 h-96 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt=""
          className="h-full w-full scale-110 object-cover opacity-30 blur-3xl"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
      </div>

      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          <div className="mx-auto w-full max-w-[260px] shrink-0 sm:mx-0">
            <CoverLightbox src={cover} alt={work.title} nsfw={work.nsfw} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <p className="font-mono text-xs text-muted-foreground">{work.id}</p>
              {work.isArchive && (
                <p className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  <FileArchive className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t("work.archived", {
                      file: path.basename(work.folderPath),
                    })}
                  </span>
                </p>
              )}
              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {work.title}
              </h1>
            </div>
            {work.circleName && (
              <p className="text-sm">
                <span className="text-muted-foreground">{t("work.circle")}:</span>{" "}
                {work.circleId ? (
                  <Link
                    href={`/?circles=${work.circleId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {work.circleName}
                  </Link>
                ) : (
                  <span className="font-medium">{work.circleName}</span>
                )}
              </p>
            )}
            {work.voiceActors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {t("work.voiceActors")}:
                </span>
                {work.voiceActors.map((va) => (
                  <Link
                    key={va.id}
                    href={`/?va=${va.id}`}
                    className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                  >
                    {va.name}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {work.releaseDate && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {work.releaseDate}
                </span>
              )}
              {work.workType && (
                <span className="inline-flex items-center gap-1">
                  <Disc className="h-3.5 w-3.5" />
                  {work.workType}
                </span>
              )}
              {work.language && (
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  {work.language}
                </span>
              )}
              {work.nsfw && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  R18
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <TagIcon className="h-3.5 w-3.5" />
                {t("work.tags")}:
              </span>
              {work.tags.map((t) => (
                <Link
                  key={t.id}
                  href={`/?tags=${t.id}`}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                >
                  {t.name}
                </Link>
              ))}
              <AddTagButton
                workId={work.id}
                existingTagNames={work.tags.map((t) => t.name)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {work.dlsiteUrl && (
                <a
                  href={work.dlsiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("work.viewOnDlsite")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <EditWorkDialog
                workId={work.id}
                coverSrc={cover}
                initial={{
                  title: work.title,
                  circleName: work.circleName,
                  releaseDate: work.releaseDate,
                  workType: work.workType,
                  language: work.language,
                  description: work.description,
                  nsfw: work.nsfw,
                  voiceActors: work.voiceActors.map((va) => va.name),
                  tags: work.tags.map((t) => t.name),
                  coverUrl: work.coverUrl,
                }}
              />
              <RevealFolderButton workId={work.id} isArchive={work.isArchive} />
              <DeleteWorkButton workId={work.id} workTitle={work.title} />
            </div>
            {work.description && (
              <p className="whitespace-pre-line pt-2 text-sm leading-relaxed text-muted-foreground">
                {work.description}
              </p>
            )}
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">
            {t("work.tracks")}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {work.tracks.length}
            </span>
          </h2>
          {work.tracks.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              {work.isArchive ? t("work.noTracksArchived") : t("work.noTracks")}
            </div>
          ) : (
            <TrackList
              tracks={work.tracks}
              workId={work.id}
              workTitle={work.title}
              coverSrc={cover}
            />
          )}
        </section>
      </div>
    </div>
  );
}
