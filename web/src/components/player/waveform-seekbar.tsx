"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, formatTime } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import {
  getCachedWaveform,
  isWaveformUnavailable,
  loadWaveform,
  normalizePeaks,
  resampleForBars,
  type WaveformStatus,
} from "./waveform-data";
import {
  addBookmark,
  ensureBookmarksLoaded,
  removeBookmark,
  useTrackBookmarks,
} from "./bookmark-store";

/**
 * Waveform seek bar — the alternative to the thin `TopSeekbar` line.
 *
 * The bars are painted once into an offscreen canvas that is then used as a
 * CSS mask over two solid-colour layers (played / unplayed). That keeps the
 * colours as theme tokens, lets playback progress be a plain width change
 * instead of a per-frame repaint, and means the canvas is only redrawn when
 * the peaks or the element's size actually change.
 */

/** CSS px per bar, including the gap. */
const BAR_PITCH = 3;
const BAR_WIDTH = 2;
/** Minimum painted bar height, so silence reads as a hairline, not a gap. */
const MIN_BAR_HEIGHT = 2;
/** Height of the flat placeholder shown while peaks load or if they can't. */
const PLACEHOLDER_HEIGHT = 3;
/** How close a right-click must land to an existing bookmark to remove it. */
const BOOKMARK_HIT_PX = 7;

/**
 * Loads the envelope for one track.
 *
 * The caller keys this component by track id, so `trackId` is fixed for the
 * lifetime of an instance and the initial state can be read straight from the
 * session cache — a track played earlier draws its waveform on first paint.
 */
function useWaveform(trackId: number | null) {
  const [peaks, setPeaks] = useState<Float32Array | null>(() => {
    if (trackId === null) return null;
    const cached = getCachedWaveform(trackId);
    return cached ? normalizePeaks(cached) : null;
  });
  const [status, setStatus] = useState<WaveformStatus>(() => {
    if (trackId === null) return "loading";
    if (getCachedWaveform(trackId)) return "ready";
    return isWaveformUnavailable(trackId) ? "unavailable" : "loading";
  });

  useEffect(() => {
    if (trackId === null) return;
    if (getCachedWaveform(trackId) || isWaveformUnavailable(trackId)) return;

    let active = true;
    void loadWaveform(trackId).then((raw) => {
      if (!active) return;
      if (raw) {
        setPeaks(normalizePeaks(raw));
        setStatus("ready");
      } else {
        setStatus("unavailable");
      }
    });

    return () => {
      active = false;
    };
  }, [trackId]);

  return { peaks, status };
}

/** Paints the bars (or the flat placeholder) and returns a mask data URL. */
function buildMask(
  peaks: Float32Array | null,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) return null;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#fff";

  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  };

  if (!peaks) {
    const h = Math.min(PLACEHOLDER_HEIGHT, height);
    rounded(0, (height - h) / 2, width, h, h / 2);
    return canvas.toDataURL();
  }

  const count = Math.max(1, Math.floor(width / BAR_PITCH));
  const bars = resampleForBars(peaks, count);
  for (let i = 0; i < count; i++) {
    const h = Math.max(MIN_BAR_HEIGHT, bars[i] * height);
    rounded(i * BAR_PITCH, (height - h) / 2, BAR_WIDTH, h, BAR_WIDTH / 2);
  }
  return canvas.toDataURL();
}

export function WaveformSeekbar({
  trackId,
  current,
  duration,
  onSeek,
}: {
  trackId: number | null;
  current: number;
  duration: number;
  onSeek: (s: number) => void;
}) {
  const { t } = useTranslations();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const { peaks, status } = useWaveform(trackId);
  const bookmarks = useTrackBookmarks(trackId);

  useEffect(() => {
    if (trackId !== null) ensureBookmarksLoaded([trackId]);
  }, [trackId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        Math.round(prev.width) === Math.round(rect.width) &&
        Math.round(prev.height) === Math.round(rect.height)
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maskUrl = useMemo(
    () => buildMask(peaks, size.width, size.height),
    [peaks, size.width, size.height],
  );

  const maskStyle = useMemo<React.CSSProperties>(
    () =>
      maskUrl
        ? {
            maskImage: `url(${maskUrl})`,
            maskSize: "100% 100%",
            maskRepeat: "no-repeat",
            WebkitMaskImage: `url(${maskUrl})`,
            WebkitMaskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat",
          }
        : { opacity: 0 },
    [maskUrl],
  );

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    // Left button only — right-click belongs to the bookmark menu below, and
    // without this it would start a scrub and seek on release.
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragValue(seekFromEvent(e.clientX));
  };

  /** Right-click toggles a bookmark: on an existing marker removes it, else adds. */
  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = wrapRef.current;
    if (!el || duration <= 0) return;

    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const at = ratio * duration;

    // Markers are pointer-events-none so they never block scrubbing, so hit
    // testing happens here in seconds-per-pixel terms.
    const tolerance = (BOOKMARK_HIT_PX / rect.width) * duration;
    let nearest: number | null = null;
    let nearestDistance = Infinity;
    for (const b of bookmarks) {
      const distance = Math.abs(b - at);
      if (distance <= tolerance && distance < nearestDistance) {
        nearestDistance = distance;
        nearest = b;
      }
    }

    if (trackId === null) return;
    if (nearest !== null) removeBookmark(trackId, nearest);
    else addBookmark(trackId, at);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (el && duration > 0) {
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      setHoverPct(ratio * 100);
    }
    if (!dragging) return;
    setDragValue(seekFromEvent(e.clientX));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    const v = seekFromEvent(e.clientX);
    setDragValue(null);
    onSeek(v);
  };

  const value = dragValue ?? current;
  const pct = duration > 0 ? Math.max(0, Math.min(100, (value / duration) * 100)) : 0;
  const disabled = duration <= 0;

  // Keep the bubble fully inside the strip at either end.
  const bubblePx =
    hoverPct === null || size.width === 0
      ? 0
      : Math.max(28, Math.min(size.width - 28, (hoverPct / 100) * size.width));

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHoverPct(null)}
      onContextMenu={onContextMenu}
      className={cn(
        "group/wave relative h-10 w-full touch-none select-none sm:h-12",
        disabled ? "pointer-events-none" : "cursor-pointer",
      )}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={duration || 1}
      aria-valuenow={value}
      aria-valuetext={t("player.seekPosition", {
        current: formatTime(value),
        total: formatTime(duration),
      })}
      aria-label={t("player.seek")}
      tabIndex={0}
    >
      {/* Unplayed */}
      <div
        className={cn(
          "absolute inset-0 bg-foreground/25 transition-colors group-hover/wave:bg-foreground/35",
          status === "loading" && "animate-pulse",
        )}
        style={maskStyle}
      />

      {/* Played — the same full-width layer, clipped to the current position */}
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: size.width || "100%", ...maskStyle }}
        />
      </div>

      {/* Bookmarks — never interactive, so scrubbing straight through works */}
      {duration > 0 &&
        bookmarks.map((b) => (
          <div
            key={b}
            className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-amber-400"
            style={{ left: `${Math.min(100, (b / duration) * 100)}%` }}
          >
            <div className="absolute top-0 left-1/2 h-1.5 w-[5px] -translate-x-1/2 rounded-b-[2px] bg-amber-400" />
          </div>
        ))}

      {/* Playhead */}
      {!disabled && (
        <div
          className="pointer-events-none absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_0_1px] shadow-background"
          style={{ left: `${pct}%` }}
        />
      )}

      {/* Hover position + time bubble */}
      {hoverPct !== null && !disabled && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${hoverPct}%` }}
          />
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded bg-popover px-1.5 py-0.5 text-[10px] tabular-nums text-popover-foreground shadow-sm ring-1 ring-border"
            style={{ left: `${bubblePx}px` }}
          >
            {formatTime((hoverPct / 100) * duration)}
          </div>
        </>
      )}
    </div>
  );
}
