"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/utils";
import { usePlayer } from "./player-store";
import { usePlayerPrefs } from "./player-prefs";
import { WaveformSeekbar } from "./waveform-seekbar";
import { prefetchWaveform } from "./waveform-data";

function TopSeekbar({
  current,
  duration,
  onSeek,
}: {
  current: number;
  duration: number;
  onSeek: (s: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragValue(seekFromEvent(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (el && duration > 0) {
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      setHoverPct(ratio * 100);
    }
    if (!draggingRef.current) return;
    setDragValue(seekFromEvent(e.clientX));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const v = seekFromEvent(e.clientX);
    setDragValue(null);
    onSeek(v);
  };

  const value = dragValue ?? current;
  const pct = duration > 0 ? (value / duration) * 100 : 0;
  const disabled = duration <= 0;

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHoverPct(null)}
      className={`group/seek absolute inset-x-0 -top-1.5 z-10 flex h-3 items-center pointer-coarse:-top-3 pointer-coarse:h-6 touch-none select-none ${disabled ? "pointer-events-none" : "cursor-pointer"}`}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={duration || 1}
      aria-valuenow={value}
      aria-label="Seek"
      tabIndex={0}
    >
      <div className="relative w-full overflow-visible bg-muted/60 transition-[height] duration-100 h-0.5 pointer-coarse:h-1 group-hover/seek:h-1.5">
        <div
          className="h-full bg-primary"
          style={{ width: `${pct}%` }}
        />
        {hoverPct !== null && !draggingRef.current && (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-primary/40"
            style={{ left: `${hoverPct}%` }}
          />
        )}
        <div
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 ring-2 ring-background transition-opacity group-hover/seek:opacity-100 pointer-coarse:h-4 pointer-coarse:w-4 pointer-coarse:opacity-100"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function VolumeControl({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const lastNonZeroRef = useRef(volume > 0 ? volume : 1);

  useEffect(() => {
    if (volume > 0) lastNonZeroRef.current = volume;
  }, [volume]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const valueFromEvent = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, 1 - (clientY - rect.top) / rect.height),
    );
    return ratio;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    onChange(valueFromEvent(e.clientY));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onChange(valueFromEvent(e.clientY));
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const pct = Math.round(volume * 100);

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label="Volume"
        aria-expanded={open}
        className="h-9 w-9"
      >
        {volume === 0 ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-3 flex w-12 flex-col items-center rounded-md border bg-popover py-3 shadow-md">
          <span className="mb-2 text-[10px] tabular-nums text-muted-foreground">
            {pct}
          </span>
          <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative h-32 w-6 cursor-pointer touch-none select-none"
            role="slider"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            tabIndex={0}
          >
            <div className="absolute left-1/2 top-0 h-full w-1.5 -translate-x-1/2 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute bottom-0 left-0 w-full bg-primary"
                style={{ height: `${pct}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute left-1/2 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
              style={{ bottom: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayerBar() {
  const p = usePlayer();
  const { seekbarStyle } = usePlayerPrefs();
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const waveformView = seekbarStyle === "waveform";

  useEffect(() => {
    p.audioRef.current = audioElRef.current;
  }, [p.audioRef]);

  // Warm the next queue entry so skipping forward doesn't wait on a decode.
  // Delayed so it doesn't compete with the current track's own request.
  const nextTrackId = p.queue[p.currentIndex + 1]?.id;
  useEffect(() => {
    if (!waveformView || nextTrackId === undefined) return;
    const timer = setTimeout(() => prefetchWaveform(nextTrackId), 3000);
    return () => clearTimeout(timer);
  }, [waveformView, nextTrackId]);

  if (!p.current) {
    return <audio ref={audioElRef} preload="metadata" />;
  }

  const t = p.currentTime;
  const d = p.duration || p.current.durationSeconds || 0;

  return (
    <>
      <audio
        ref={audioElRef}
        preload="metadata"
        onLoadedMetadata={(e) => p._setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => p._setTime(e.currentTarget.currentTime)}
        onPlay={() => p._setIsPlaying(true)}
        onPause={() => p._setIsPlaying(false)}
        onEnded={() => p.next()}
      />
      <div className="sticky bottom-0 z-50 border-t bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        {waveformView ? (
          <WaveformSeekbar
            key={p.current.id}
            trackId={p.current.id}
            current={t}
            duration={d}
            onSeek={(s) => p.seek(s)}
          />
        ) : (
          <TopSeekbar current={t} duration={d} onSeek={(s) => p.seek(s)} />
        )}
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-4 sm:px-6 sm:py-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Link
            href={`/works/${p.current.workId}`}
            className="group flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted sm:h-14 sm:w-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.current.coverSrc}
                alt=""
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {p.current.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.current.workTitle}
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={p.previous}
              aria-label="Previous"
              className="hidden sm:inline-flex"
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={p.togglePlay}
              aria-label={p.isPlaying ? "Pause" : "Play"}
              className="h-10 w-10 rounded-full"
            >
              {p.isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={p.next}
              aria-label="Next"
              className="hidden sm:inline-flex"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          <div className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
            <span>{formatTime(t)}</span>
            <span>/</span>
            <span>{formatTime(d)}</span>
          </div>

          <VolumeControl
            volume={p.volume}
            onChange={(v) => p.setVolume(v)}
          />
        </div>
      </div>
    </>
  );
}
