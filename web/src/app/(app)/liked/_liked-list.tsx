"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Play, Pause, Shuffle } from "lucide-react";
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

/**
 * Fisher-Yates over the ids. Only ever called from a click handler: calling it
 * while rendering would give the server and the client different orders and
 * fail hydration.
 */
function shuffledIdsOf(tracks: LikedTrack[]) {
  const ids = tracks.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
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
  // The shuffle is held as ids rather than as a reordered copy of the rows, so
  // that a re-render carrying a changed `tracks` (a like dropped or added since
  // the shuffle) resolves against the current data instead of pinning stale rows.
  const [shuffleIds, setShuffleIds] = useState<number[] | null>(null);
  const shuffled = shuffleIds !== null;

  const ordered = useMemo(() => {
    if (!shuffleIds) return tracks;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const inOrder = shuffleIds
      .map((id) => byId.get(id))
      .filter((t): t is LikedTrack => t !== undefined);
    // Anything liked after the shuffle has no slot in it; append rather than
    // drop, so the page never silently hides a track.
    const placed = new Set(shuffleIds);
    return [...inOrder, ...tracks.filter((t) => !placed.has(t.id))];
  }, [shuffleIds, tracks]);

  // Built from `ordered`, so pressing play hands the player the list as it is
  // shown: shuffled on screen means shuffled playback.
  const queue: QueueTrack[] = ordered.map((t) => ({
    id: t.id,
    title: t.title,
    workId: t.workId,
    workTitle: t.workTitle,
    coverSrc: t.cover,
    durationSeconds: t.durationSeconds,
  }));

  return (
    <>
      {tracks.length > 1 && (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() =>
              setShuffleIds((ids) => (ids ? null : shuffledIdsOf(tracks)))
            }
            aria-pressed={shuffled}
            title={
              shuffled
                ? translate("liked.shuffleOff")
                : translate("liked.shuffleOn")
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              shuffled
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Shuffle className="h-3.5 w-3.5" />
            {translate("liked.shuffle")}
          </button>
        </div>
      )}
      {/* `grid-cols-1` is load-bearing, not decoration: without it the single
          column is an implicit `auto` track, which sizes to the rows'
          max-content — and a row's max-content is its untruncated nowrap title,
          so the track grows past the viewport and the whole page scrolls
          sideways. Tailwind's grid-cols-1 is `minmax(0, 1fr)`, whose 0 minimum
          lets the track shrink back to the container and hands the rows a width
          to truncate against. */}
      <ul className="grid grid-cols-1 gap-2 sm:gap-2.5">
        {ordered.map((t, i) => {
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
                  // `block` is load-bearing: an <a> is inline by default, and
                  // overflow (so truncate's ellipsis) does not apply to inline
                  // boxes. Without it the nowrap work title runs straight out of
                  // the row and gives the whole page a horizontal scrollbar. The
                  // sibling <p> gets away with a bare `truncate` because it is
                  // already a block.
                  className="block truncate text-xs text-muted-foreground hover:text-foreground"
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
                  playingThis
                    ? translate("track.pause")
                    : translate("track.play")
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
    </>
  );
}
