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
): Pref<T> {
  /** Cached so the snapshot stays referentially stable between renders. */
  let cached: T | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function onStorage(e: StorageEvent) {
    if (e.key !== storageKey) return;
    cached = isValid(e.newValue) ? e.newValue : fallback;
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
      cached = isValid(stored) ? stored : fallback;
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
} {
  const seekbarStyle = seekbarPref.useValue();
  const resumeMode = resumePref.useValue();
  return {
    seekbarStyle,
    setSeekbarStyle: seekbarPref.set,
    resumeMode,
    setResumeMode: resumePref.set,
  };
}
