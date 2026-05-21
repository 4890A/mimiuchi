"use client";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LikeButton } from "@/components/like-button";
import { usePlayer, type QueueTrack } from "@/components/player/player-store";
import { cn } from "@/lib/utils";

interface Track {
  id: number;
  title: string;
  trackNumber: number | null;
  durationSeconds: number | null;
  liked: boolean;
  initialPosition?: number;
}

function formatDuration(s: number | null) {
  if (!s || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function TrackList({
  tracks,
  workId,
  workTitle,
  coverSrc,
}: {
  tracks: Array<
    Track & { progress: { positionSeconds: number; completed: boolean } | null }
  >;
  workId: string;
  workTitle: string;
  coverSrc: string;
}) {
  const p = usePlayer();
  const queueTracks: QueueTrack[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    workId,
    workTitle,
    coverSrc,
    durationSeconds: t.durationSeconds,
    initialPosition: t.progress?.positionSeconds ?? 0,
  }));

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {tracks.map((t, i) => {
        const isCurrent = p.current?.id === t.id;
        const playingThis = isCurrent && p.isPlaying;
        const progressPct = t.progress?.positionSeconds && t.durationSeconds
          ? Math.min(100, (t.progress.positionSeconds / t.durationSeconds) * 100)
          : 0;
        return (
          <li
            key={t.id}
            className={cn(
              "group relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40",
              isCurrent && "bg-accent/30",
            )}
          >
            <Button
              variant={isCurrent ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => {
                if (isCurrent) p.togglePlay();
                else p.playQueue(queueTracks, i);
              }}
              aria-label={playingThis ? "Pause" : "Play"}
            >
              {playingThis ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {t.trackNumber ?? i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm",
                  isCurrent && "font-medium text-primary",
                )}
              >
                {t.title}
              </p>
              {progressPct > 0 && !t.progress?.completed && (
                <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary/60"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatDuration(t.durationSeconds)}
            </span>
            <LikeButton trackId={t.id} initialLiked={t.liked} />
          </li>
        );
      })}
    </ul>
  );
}
