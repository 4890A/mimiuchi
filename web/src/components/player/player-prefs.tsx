"use client";
import { useSyncExternalStore } from "react";
import {
  DEFAULT_RESUME_MODE,
  isResumeMode,
  type ResumeMode,
} from "@/lib/resume";

/**
 * Per-device player preferences.
 *
 * These live in localStorage rather than the settings table: they describe how
 * this browser plays and draws things, so a phone can keep the compact bar
 * while a desktop shows the waveform.
 *
 * Backed by module-level stores read through `useSyncExternalStore`, so the
 * server snapshot is always the default (no hydration mismatch) and every
 * subscriber — player bar and settings page alike — updates together without a
 * provider in between.
 */

export type SeekbarStyle = "bar" | "waveform";
/**
 * Whether this device streams lossless tracks as they are, or asks the server
 * for a compressed copy. See `lib/transcode` for why a phone wants the latter.
 */
export type WavPlayback = "original" | "compressed";
export type { ResumeMode };

interface Pref<T extends string> {
  /** Non-reactive read, for callbacks and event handlers. */
  get: () => T;
  set: (value: T) => void;
  useValue: () => T;
}

function createPref<T extends string>(
  storageKey: string,
  fallback: T,
  isValid: (v: unknown) => v is T,
  /**
   * Consulted when this browser has nothing stored yet, so a preference can
   * default by device. Deliberately not used for the server snapshot: that
   * stays `fallback` on every device, and the first client read corrects it.
   */
  clientDefault?: () => T,
): Pref<T> {
  /** Cached so the snapshot stays referentially stable between renders. */
  let cached: T | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function unset(): T {
    try {
      return clientDefault?.() ?? fallback;
    } catch {
      return fallback;
    }
  }

  function onStorage(e: StorageEvent) {
    if (e.key !== storageKey) return;
    cached = isValid(e.newValue) ? e.newValue : unset();
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

  function get(): T {
    if (cached !== null) return cached;
    try {
      const stored = window.localStorage.getItem(storageKey);
      cached = isValid(stored) ? stored : unset();
    } catch {
      // Private mode / storage disabled — fall back to the default.
      cached = fallback;
    }
    return cached;
  }

  function getServerSnapshot(): T {
    return fallback;
  }

  function set(value: T) {
    if (cached === value) return;
    cached = value;
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {}
    notify();
  }

  return {
    get,
    set,
    useValue: () => useSyncExternalStore(subscribe, get, getServerSnapshot),
  };
}

const seekbarPref = createPref<SeekbarStyle>(
  "kikoeru.player.seekbarStyle",
  "bar",
  (v): v is SeekbarStyle => v === "bar" || v === "waveform",
);

const resumePref = createPref<ResumeMode>(
  "kikoeru.player.resumeMode",
  DEFAULT_RESUME_MODE,
  isResumeMode,
);

const wavPlaybackPref = createPref<WavPlayback>(
  "kikoeru.player.wavPlayback",
  "original",
  (v): v is WavPlayback => v === "original" || v === "compressed",
  // Phones are what stall on a multi-megabit WAV once the screen goes off and
  // the radio drops into power-save, so they get the small copy by default. A
  // desktop on the same server has no such trouble and keeps the original.
  () =>
    window.matchMedia?.("(pointer: coarse)")?.matches
      ? "compressed"
      : "original",
);

/**
 * Read outside of React, for the same reason as `getResumeMode`: the player
 * builds an audio URL inside a callback.
 */
export function getWavPlayback(): WavPlayback {
  if (typeof window === "undefined") return "original";
  return wavPlaybackPref.get();
}

/**
 * Read outside of React: the player picks a start position inside a callback,
 * where re-rendering on a preference change would be pointless churn.
 */
export function getResumeMode(): ResumeMode {
  if (typeof window === "undefined") return DEFAULT_RESUME_MODE;
  return resumePref.get();
}

export function usePlayerPrefs(): {
  seekbarStyle: SeekbarStyle;
  setSeekbarStyle: (style: SeekbarStyle) => void;
  resumeMode: ResumeMode;
  setResumeMode: (mode: ResumeMode) => void;
  wavPlayback: WavPlayback;
  setWavPlayback: (mode: WavPlayback) => void;
} {
  const seekbarStyle = seekbarPref.useValue();
  const resumeMode = resumePref.useValue();
  const wavPlayback = wavPlaybackPref.useValue();
  return {
    seekbarStyle,
    setSeekbarStyle: seekbarPref.set,
    resumeMode,
    setResumeMode: resumePref.set,
    wavPlayback,
    setWavPlayback: wavPlaybackPref.set,
  };
}
