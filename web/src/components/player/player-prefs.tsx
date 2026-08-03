"use client";
import { useSyncExternalStore } from "react";

/**
 * Per-device player display preferences.
 *
 * These live in localStorage rather than the settings table: they describe how
 * this browser draws the player, so a phone can keep the compact bar while a
 * desktop shows the waveform.
 *
 * Backed by a module-level store read through `useSyncExternalStore`, so the
 * server snapshot is always the default (no hydration mismatch) and every
 * subscriber — player bar and settings page alike — updates together without a
 * provider in between.
 */

export type SeekbarStyle = "bar" | "waveform";

const STORAGE_KEY = "kikoeru.player.seekbarStyle";
const DEFAULT_STYLE: SeekbarStyle = "bar";

function isSeekbarStyle(v: unknown): v is SeekbarStyle {
  return v === "bar" || v === "waveform";
}

/** Cached so getSnapshot stays referentially stable between renders. */
let cached: SeekbarStyle | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  cached = isSeekbarStyle(e.newValue) ? e.newValue : DEFAULT_STYLE;
  notify();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Only one window listener regardless of how many components subscribe.
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): SeekbarStyle {
  if (cached !== null) return cached;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    cached = isSeekbarStyle(stored) ? stored : DEFAULT_STYLE;
  } catch {
    // Private mode / storage disabled — fall back to the default.
    cached = DEFAULT_STYLE;
  }
  return cached;
}

function getServerSnapshot(): SeekbarStyle {
  return DEFAULT_STYLE;
}

function setSeekbarStyle(style: SeekbarStyle) {
  if (cached === style) return;
  cached = style;
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {}
  notify();
}

export function usePlayerPrefs(): {
  seekbarStyle: SeekbarStyle;
  setSeekbarStyle: (style: SeekbarStyle) => void;
} {
  const seekbarStyle = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { seekbarStyle, setSeekbarStyle };
}
