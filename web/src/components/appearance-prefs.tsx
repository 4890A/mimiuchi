"use client";
import { useSyncExternalStore } from "react";

/**
 * Per-device appearance preferences that live in localStorage.
 *
 * Same shape as `player/player-prefs`: a module-level store read through
 * `useSyncExternalStore`, so the server snapshot is always the default and
 * hydration can't drift.
 *
 * The work-card tag chips are server-rendered, so the pref is expressed as a
 * class on `<html>` and enforced by CSS (see `globals.css`) rather than by a
 * prop. `app/layout.tsx` sets the same class from a pre-paint script, so a
 * reload never flashes tags that are meant to be hidden — keep the storage key
 * and class name here in sync with that script.
 */

const STORAGE_KEY = "library:hide-tags";
const CLASS_NAME = "hide-card-tags";

/** Cached so getSnapshot stays referentially stable between renders. */
let cached: boolean | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function applyClass(hidden: boolean) {
  document.documentElement.classList.toggle(CLASS_NAME, hidden);
}

function onStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  cached = e.newValue === "1";
  applyClass(cached);
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

function getSnapshot(): boolean {
  if (cached !== null) return cached;
  try {
    cached = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private mode / storage disabled — fall back to showing tags.
    cached = false;
  }
  return cached;
}

function getServerSnapshot(): boolean {
  return false;
}

function setHideCardTags(hidden: boolean) {
  if (cached === hidden) return;
  cached = hidden;
  applyClass(hidden);
  try {
    window.localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    // not persisted, but the class still applies for this visit
  }
  notify();
}

export function useHideCardTags(): {
  hideCardTags: boolean;
  setHideCardTags: (hidden: boolean) => void;
} {
  const hideCardTags = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { hideCardTags, setHideCardTags };
}
