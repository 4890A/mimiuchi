"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LikeButton } from "@/components/like-button";
import { usePlayer, type QueueTrack } from "@/components/player/player-store";
import {
  ensureBookmarksLoaded,
  useBookmarkMap,
} from "@/components/player/bookmark-store";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface Track {
  id: number;
  title: string;
  trackNumber: number | null;
  durationSeconds: number | null;
  liked: boolean;
  relativePath: string;
  initialPosition?: number;
}

type TrackWithProgress = Track & {
  progress: { positionSeconds: number; completed: boolean } | null;
};

function formatDuration(s: number | null) {
  if (!s || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function folderOf(rel: string): string {
  // relativePath may use `/` (POSIX scans) or `\` (Windows scans) as the
  // separator. Normalize for splitting and for display.
  const norm = rel.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(0, i) : "";
}

function groupTracks(tracks: TrackWithProgress[]): {
  folder: string;
  tracks: TrackWithProgress[];
}[] {
  const sorted = [...tracks].sort((a, b) => {
    const fa = folderOf(a.relativePath);
    const fb = folderOf(b.relativePath);
    if (fa !== fb) {
      // Root tracks (folder === "") first, then folders alphabetically.
      if (fa === "") return -1;
      if (fb === "") return 1;
      return fa.localeCompare(fb);
    }
    const ta = a.trackNumber ?? Number.POSITIVE_INFINITY;
    const tb = b.trackNumber ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.relativePath.localeCompare(b.relativePath);
  });

  const groups: { folder: string; tracks: TrackWithProgress[] }[] = [];
  for (const t of sorted) {
    const f = folderOf(t.relativePath);
    const last = groups[groups.length - 1];
    if (last && last.folder === f) last.tracks.push(t);
    else groups.push({ folder: f, tracks: [t] });
  }
  return groups;
}

export function TrackList({
  tracks,
  workId,
  workTitle,
  coverSrc,
}: {
  tracks: TrackWithProgress[];
  workId: string;
  workTitle: string;
  coverSrc: string;
}) {
  const p = usePlayer();
  // Rows bind `t` to a track below, so the translator takes a name.
  const { t: translate } = useTranslations();
  const bookmarkMap = useBookmarkMap();

  const trackIds = useMemo(() => tracks.map((t) => t.id), [tracks]);
  useEffect(() => {
    ensureBookmarksLoaded(trackIds);
  }, [trackIds]);

  // `track.progress` is the snapshot taken when the page rendered, so once the
  // user has played something it is stale. Remember where each track actually
  // got to this session, otherwise a row snaps back to its page-load position
  // the moment playback moves on to the next track.
  const [sessionPositions, setSessionPositions] = useState<Map<number, number>>(
    () => new Map(),
  );
  const latestTimeRef = useRef(0);
  useEffect(() => {
    latestTimeRef.current = p.currentTime;
  }, [p.currentTime]);

  const currentId = p.current?.id;
  useEffect(() => {
    if (currentId === undefined) return;
    // On the way out, bank the position this track reached.
    return () => {
      const reached = latestTimeRef.current;
      setSessionPositions((prev) => new Map(prev).set(currentId, reached));
    };
  }, [currentId]);

  const groups = useMemo(() => groupTracks(tracks), [tracks]);
  // Suppress grouping UI when there's a single homogeneous group — keeps the
  // list visually unchanged for works that don't need folder headers.
  const showGroups = groups.length > 1;

  const folderNames = useMemo(
    () => groups.map((g) => g.folder).filter((f) => f !== ""),
    [groups],
  );
  // Default: every folder open.
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(folderNames),
  );
  const anyOpen = folderNames.some((f) => openFolders.has(f));
  const toggleAll = () =>
    setOpenFolders(anyOpen ? new Set() : new Set(folderNames));
  const setFolderOpen = (folder: string, isOpen: boolean) =>
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(folder);
      else next.delete(folder);
      return next;
    });

  const flat = showGroups ? groups.flatMap((g) => g.tracks) : tracks;
  const queueTracks: QueueTrack[] = flat.map((t) => ({
    id: t.id,
    title: t.title,
    workId,
    workTitle,
    coverSrc,
    durationSeconds: t.durationSeconds,
    initialPosition: t.progress?.positionSeconds ?? 0,
    completed: t.progress?.completed ?? false,
  }));

  function renderTrack(t: TrackWithProgress, queueIndex: number, displayNumber: number) {
    const isCurrent = p.current?.id === t.id;
    const playingThis = isCurrent && p.isPlaying;

    // Live for the playing track, last-known for anything played this session,
    // page-load snapshot otherwise.
    const duration =
      (isCurrent ? p.duration || t.durationSeconds : t.durationSeconds) ?? 0;
    const position = isCurrent
      ? p.currentTime
      : (sessionPositions.get(t.id) ?? t.progress?.positionSeconds ?? 0);
    const progressPct =
      duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

    const bookmarks = bookmarkMap.get(t.id) ?? [];
    // Keep the bar mounted for the current track so it doesn't pop in mid-play,
    // and show it whenever there are bookmarks to place on it.
    const showBar =
      duration > 0 &&
      (isCurrent ||
        bookmarks.length > 0 ||
        (progressPct > 0 && !t.progress?.completed));

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
            else p.playQueue(queueTracks, queueIndex);
          }}
          aria-label={
            playingThis ? translate("track.pause") : translate("track.play")
          }
        >
          {playingThis ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {t.trackNumber ?? displayNumber}
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
          {showBar && (
            // Taller than the rail so bookmark ticks stand proud of it.
            <div className="relative mt-1 h-1.5 w-full">
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary/60"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {bookmarks.map((b) => (
                <div
                  key={b}
                  className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full bg-amber-400"
                  style={{ left: `${Math.min(100, (b / duration) * 100)}%` }}
                />
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDuration(t.durationSeconds)}
        </span>
        <LikeButton trackId={t.id} initialLiked={t.liked} />
      </li>
    );
  }

  if (!showGroups) {
    return (
      <ul className="divide-y rounded-lg border bg-card">
        {tracks.map((t, i) => renderTrack(t, i, i + 1))}
      </ul>
    );
  }

  let queueCursor = 0;
  let displayCursor = 0;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-end border-b px-2 py-1">
        <button
          type="button"
          onClick={toggleAll}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          aria-label={
            anyOpen
              ? translate("track.collapseAllFolders")
              : translate("track.expandAllFolders")
          }
        >
          {anyOpen ? (
            <ChevronsDownUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5" />
          )}
          {anyOpen ? translate("track.collapseAll") : translate("track.expandAll")}
        </button>
      </div>
      {groups.map((g, gi) => {
        const groupStartQueue = queueCursor;
        const groupStartDisplay = displayCursor;
        queueCursor += g.tracks.length;
        displayCursor += g.tracks.length;

        if (g.folder === "") {
          return (
            <ul
              key={`root-${gi}`}
              className={cn("divide-y", gi > 0 && "border-t")}
            >
              {g.tracks.map((t, i) =>
                renderTrack(t, groupStartQueue + i, groupStartDisplay + i + 1),
              )}
            </ul>
          );
        }

        const isOpen = openFolders.has(g.folder);
        return (
          <details
            key={`${g.folder}-${gi}`}
            open={isOpen}
            onToggle={(e) =>
              setFolderOpen(g.folder, (e.currentTarget as HTMLDetailsElement).open)
            }
            className={cn("group/folder", gi > 0 && "border-t")}
          >
            <summary
              className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground select-none hover:bg-accent/30 [&::-webkit-details-marker]:hidden"
            >
              <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open/folder:rotate-90" />
              <Folder className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{g.folder}</span>
              <span className="ml-auto shrink-0 tabular-nums">
                {g.tracks.length}
              </span>
            </summary>
            <ul className="divide-y border-t">
              {g.tracks.map((t, i) =>
                renderTrack(t, groupStartQueue + i, groupStartDisplay + i + 1),
              )}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
