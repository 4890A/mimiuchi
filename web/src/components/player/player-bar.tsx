"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatTime } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import { usePlayer } from "./player-store";
import { usePlayerPrefs } from "./player-prefs";
import { WaveformSeekbar } from "./waveform-seekbar";
import { prefetchWaveform } from "./waveform-data";

function TopSeekbar({
  current,
  duration,
  onSeek,
  inline = false,
}: {
  current: number;
  duration: number;
  onSeek: (s: number) => void;
  /**
   * `false` (the default) pins the line to the player's top edge, full bleed.
   * `true` lays it out in flow as a rounded track, for the compact player's
   * own seek row.
   */
  inline?: boolean;
}) {
  const { t } = useTranslations();
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
    // A finger never fires pointerleave, so the hover marker would stay pinned
    // where the drag ended. Clear it on release instead.
    if (e.pointerType !== "mouse") setHoverPct(null);
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
      className={cn(
        "group/seek flex touch-none select-none items-center",
        inline
          ? "relative h-7 w-full"
          : "absolute inset-x-0 -top-1.5 z-10 h-3 pointer-coarse:-top-3 pointer-coarse:h-6",
        disabled ? "pointer-events-none" : "cursor-pointer",
      )}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={duration || 1}
      aria-valuenow={value}
      aria-label={t("player.seek")}
      tabIndex={0}
    >
      <div
        className={cn(
          "relative w-full overflow-visible bg-muted/60 transition-[height] duration-100",
          inline
            ? "h-1.5 rounded-full"
            : "h-0.5 pointer-coarse:h-1 group-hover/seek:h-1.5",
        )}
      >
        <div
          className={cn("h-full bg-primary", inline && "rounded-full")}
          style={{ width: `${pct}%` }}
        />
        {hoverPct !== null && !draggingRef.current && !inline && (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-primary/40"
            style={{ left: `${hoverPct}%` }}
          />
        )}
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background",
            inline
              ? "h-3.5 w-3.5"
              : "h-3 w-3 opacity-0 transition-opacity group-hover/seek:opacity-100 pointer-coarse:h-4 pointer-coarse:w-4 pointer-coarse:opacity-100",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Pixels per second the title slides at, once it starts moving. */
const MARQUEE_SPEED = 40;
/** Pause on the start of the title, so it's readable before anything moves. */
const MARQUEE_HOLD_START = 2500;
/** Pause once the tail is showing. */
const MARQUEE_HOLD_END = 1200;
/** How long the ride back to the start takes. */
const MARQUEE_RETURN = 450;
/** An overflow this small isn't worth animating. */
const MARQUEE_MIN_OVERFLOW = 8;

/**
 * A title too long for its box, scrolled end to end like a ticker.
 *
 * Only the compact player uses this: the transport buttons leave the title
 * barely 100px on a 360px screen, which is a few characters of a DLsite title.
 * It falls back to plain truncation when the text fits and when the OS asks
 * for reduced motion, and the ellipsis is dropped while a run is in progress —
 * an ellipsis over moving text reads as a third piece of punctuation.
 */
function MarqueeText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const viewportRef = useRef<HTMLParagraphElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;

    let animation: Animation | null = null;

    const sync = () => {
      // Cancel before measuring: a running animation leaves the span
      // translated, and restarting mid-ride would measure from wherever it is.
      animation?.cancel();
      animation = null;

      const distance = text.scrollWidth - viewport.clientWidth;
      const still =
        distance <= MARQUEE_MIN_OVERFLOW ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setScrolling(!still);
      if (still) return;

      const travel = (distance / MARQUEE_SPEED) * 1000;
      const total =
        MARQUEE_HOLD_START + travel + MARQUEE_HOLD_END + MARQUEE_RETURN;
      const at = (ms: number) => ms / total;

      // Hold, scroll at a constant rate, hold, then ease back. Written as
      // keyframes rather than CSS so the offsets can follow the distance —
      // a long title takes longer to cross, it doesn't scroll faster.
      animation = text.animate(
        [
          { transform: "translateX(0)", offset: 0, easing: "linear" },
          {
            transform: "translateX(0)",
            offset: at(MARQUEE_HOLD_START),
            easing: "linear",
          },
          {
            transform: `translateX(${-distance}px)`,
            offset: at(MARQUEE_HOLD_START + travel),
            easing: "linear",
          },
          {
            transform: `translateX(${-distance}px)`,
            offset: at(MARQUEE_HOLD_START + travel + MARQUEE_HOLD_END),
            easing: "ease-in-out",
          },
          { transform: "translateX(0)", offset: 1 },
        ],
        { duration: total, iterations: Infinity },
      );
    };

    sync();
    // The box grows and shrinks with the width of everything beside it, so
    // re-measure rather than trusting what we saw at mount.
    const ro = new ResizeObserver(sync);
    ro.observe(viewport);
    return () => {
      ro.disconnect();
      animation?.cancel();
    };
  }, [children]);

  return (
    <p
      ref={viewportRef}
      className={cn(
        "overflow-hidden whitespace-nowrap",
        scrolling ? "text-clip" : "text-ellipsis",
        className,
      )}
    >
      <span ref={textRef} className="inline-block">
        {children}
      </span>
    </p>
  );
}

function VolumeControl({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslations();
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
        aria-label={t("player.volume")}
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

/** Below Tailwind's `sm`, i.e. phones. */
const COMPACT_QUERY = "(max-width: 639.98px)";

/**
 * The compact player isn't the wide one with responsive classes — the seek bar
 * moves into a row of its own instead of hugging the top edge, so the two are
 * separate trees. Branching on a media query rather than CSS keeps a single
 * seek bar mounted, which matters for the waveform: two would mean two
 * canvases and two resize observers for the same track.
 */
function useIsCompact() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(COMPACT_QUERY);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

/**
 * Width for the elapsed/total labels, sized from the longest string either can
 * reach so the track between them doesn't jump at 9:59 → 10:00.
 */
function timeLabelWidth(duration: number) {
  const digits = formatTime(duration).length;
  if (digits >= 6) return "w-12";
  if (digits >= 5) return "w-10";
  return "w-8";
}

/**
 * The bar's outer shell, which also publishes its own height as
 * `--player-bar-height` on the document element.
 *
 * The bar is `sticky bottom-0` in normal flow, so anything drawn as a
 * full-viewport overlay covers it. The 台本 reader is the one such overlay that
 * must not: reading along while the audio plays is the point of having it. It
 * sits above `bottom: var(--player-bar-height)` instead, which needs a real
 * measurement — the height differs between the compact and wide layouts, moves
 * with the safe-area inset, and changes again when the waveform seek bar is on.
 *
 * The variable is cleared on unmount, so it reads 0 whenever the queue is empty
 * and there is no bar at all.
 */
function PlayerBarShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = (height: number) =>
      root.style.setProperty("--player-bar-height", `${Math.round(height)}px`);

    // Measured once here rather than waiting on the observer's first callback.
    // ResizeObserver delivers on an animation frame, and a background tab does
    // not get those — so a reader opened in a tab that was never brought
    // forward would size itself against a variable that is not there yet.
    // `offsetHeight` is the border box, which is what an overlay stopping
    // above the bar needs; the content box would leave its top border covered.
    publish(el.offsetHeight);

    const observer = new ResizeObserver(([entry]) => {
      publish(
        entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight,
      );
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--player-bar-height");
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky bottom-0 z-50 border-t bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
    >
      {children}
    </div>
  );
}

export function PlayerBar() {
  const p = usePlayer();
  // `t` is the current time in this component, so the translator takes a name.
  const { t: translate } = useTranslations();
  const { seekbarStyle } = usePlayerPrefs();
  const compact = useIsCompact();

  const waveformView = seekbarStyle === "waveform";

  // Warm the next queue entry so skipping forward doesn't wait on a decode.
  // Delayed so it doesn't compete with the current track's own request.
  const nextTrackId = p.queue[p.currentIndex + 1]?.id;
  useEffect(() => {
    if (!waveformView || nextTrackId === undefined) return;
    const timer = setTimeout(() => prefetchWaveform(nextTrackId), 3000);
    return () => clearTimeout(timer);
  }, [waveformView, nextTrackId]);

  // The <audio> decks live in the provider, not here — this component's tree
  // comes and goes with the queue, and a re-created element would strand them.
  if (!p.current) return null;

  const t = p.currentTime;
  const d = p.duration || p.current.durationSeconds || 0;

  const seekbar = waveformView ? (
    <WaveformSeekbar
      key={p.current.id}
      trackId={p.current.id}
      current={t}
      duration={d}
      onSeek={(s) => p.seek(s)}
      className={compact ? "h-9" : undefined}
    />
  ) : (
    <TopSeekbar
      current={t}
      duration={d}
      onSeek={(s) => p.seek(s)}
      inline={compact}
    />
  );

  const nowPlaying = (
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
        {compact ? (
          <MarqueeText className="text-sm font-medium">
            {p.current.title}
          </MarqueeText>
        ) : (
          <p className="truncate text-sm font-medium">{p.current.title}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {p.current.workTitle}
        </p>
      </div>
    </Link>
  );

  const transport = (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={p.previous}
        aria-label={translate("player.previous")}
        // Bigger than the desktop default, because on a phone it's a thumb.
        className="size-9 sm:size-8"
      >
        <SkipBack className="h-5 w-5" />
      </Button>
      <Button
        variant="default"
        size="icon"
        onClick={p.togglePlay}
        aria-label={
          p.isPlaying ? translate("track.pause") : translate("track.play")
        }
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
        aria-label={translate("player.next")}
        className="size-9 sm:size-8"
      >
        <SkipForward className="h-5 w-5" />
      </Button>
    </div>
  );

  const volume = (
    <VolumeControl volume={p.volume} onChange={(v) => p.setVolume(v)} />
  );

  // Phones: the seek bar gets a padded row of its own under the track, flanked
  // by elapsed/total, instead of running edge to edge along the top rim where
  // there is nothing to aim at and no room for a thumb.
  if (compact) {
    const timeWidth = timeLabelWidth(d);
    return (
      <PlayerBarShell>
        <div className="flex flex-col gap-1 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* gap-2, not gap-3: three transport buttons plus volume leave the
              title barely over 100px on a 360px screen as it is. */}
          <div className="flex items-center gap-2">
            {nowPlaying}
            {transport}
            {volume}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "shrink-0 text-[11px] tabular-nums text-muted-foreground",
                timeWidth,
              )}
            >
              {formatTime(t)}
            </span>
            <div className="min-w-0 flex-1">{seekbar}</div>
            <span
              className={cn(
                "shrink-0 text-right text-[11px] tabular-nums text-muted-foreground",
                timeWidth,
              )}
            >
              {formatTime(d)}
            </span>
          </div>
        </div>
      </PlayerBarShell>
    );
  }

  return (
    <PlayerBarShell>
      {seekbar}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-4 sm:px-6 sm:py-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {nowPlaying}
        {transport}

        <div className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
          <span>{formatTime(t)}</span>
          <span>/</span>
          <span>{formatTime(d)}</span>
        </div>

        {volume}
      </div>
    </PlayerBarShell>
  );
}
