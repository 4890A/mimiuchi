"use client";
import Link from "next/link";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LikeButton } from "@/components/like-button";
import { usePlayer, type QueueTrack } from "@/components/player/player-store";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface LikedTrack {
  id: number;
  title: string;
  workId: string;
  workTitle: string;
  cover: string;
  circleName: string | null;
  durationSeconds: number | null;
}

function formatDuration(s: number | null) {
  if (!s || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function LikedTrackList({ tracks }: { tracks: LikedTrack[] }) {
  const p = usePlayer();
  // Rows bind `t` to a track below, so the translator takes a name.
  const { t: translate } = useTranslations();
  const queue: QueueTrack[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    workId: t.workId,
    workTitle: t.workTitle,
    coverSrc: t.cover,
    durationSeconds: t.durationSeconds,
  }));

  return (
    <ul className="grid gap-2 sm:gap-2.5">
      {tracks.map((t, i) => {
        const isCurrent = p.current?.id === t.id;
        const playingThis = isCurrent && p.isPlaying;
        return (
          <li
            key={t.id}
            className={cn(
              "group flex items-center gap-3 rounded-xl border bg-card p-2 pr-3 transition-all hover:bg-accent/30",
              isCurrent && "ring-1 ring-primary/40",
            )}
          >
            <Link
              href={`/works/${t.workId}`}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.cover}
                alt=""
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm",
                  isCurrent && "font-medium text-primary",
                )}
              >
                {t.title}
              </p>
              <Link
                href={`/works/${t.workId}`}
                className="truncate text-xs text-muted-foreground hover:text-foreground"
              >
                {t.workTitle}
                {t.circleName ? ` · ${t.circleName}` : ""}
              </Link>
            </div>
            <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
              {formatDuration(t.durationSeconds)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => {
                if (isCurrent) p.togglePlay();
                else p.playQueue(queue, i);
              }}
              aria-label={
                playingThis ? translate("track.pause") : translate("track.play")
              }
            >
              {playingThis ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
            <LikeButton trackId={t.id} initialLiked={true} />
          </li>
        );
      })}
    </ul>
  );
}
