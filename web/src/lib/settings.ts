import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { settings as settingsTable } from "./db/schema";

export interface AppSettings {
  dlsiteProxyUrl: string;
  dlsiteProxyEnabled: boolean;
  /** Minimum gap between outbound DLsite requests, in milliseconds. */
  dlsiteMinIntervalMs: number;
  /** One or more library roots. Empty array → use env default. */
  libraryRoots: string[];
  coversDir: string;
}

const KEYS = {
  dlsiteProxyUrl: "dlsite.proxy.url",
  dlsiteProxyEnabled: "dlsite.proxy.enabled",
  dlsiteMinIntervalMs: "dlsite.rateLimit.minIntervalMs",
  libraryRoots: "scan.libraryRoot",
  coversDir: "scan.coversDir",
} as const;

/** One request per second: brisk enough for a big first scan, still polite. */
export const DEFAULT_DLSITE_MIN_INTERVAL_MS = 1_000;
export const MAX_DLSITE_MIN_INTERVAL_MS = 60_000;

function readKey(key: string): string | undefined {
  const row = db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .get();
  return row?.value;
}

function writeKey(key: string, value: string): void {
  db.insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } })
    .run();
}

function parseRoots(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampInterval(ms: number): number {
  return Math.min(Math.max(Math.round(ms), 0), MAX_DLSITE_MIN_INTERVAL_MS);
}

/** Anything unset or unparseable falls back to the default rather than to 0. */
function parseInterval(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_DLSITE_MIN_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DLSITE_MIN_INTERVAL_MS;
  return clampInterval(n);
}

export function getSettings(): AppSettings {
  return {
    dlsiteProxyUrl: readKey(KEYS.dlsiteProxyUrl) ?? "",
    dlsiteProxyEnabled: readKey(KEYS.dlsiteProxyEnabled) === "1",
    dlsiteMinIntervalMs: parseInterval(readKey(KEYS.dlsiteMinIntervalMs)),
    libraryRoots: parseRoots(readKey(KEYS.libraryRoots)),
    coversDir: readKey(KEYS.coversDir) ?? "",
  };
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  if (partial.dlsiteProxyUrl !== undefined) {
    writeKey(KEYS.dlsiteProxyUrl, partial.dlsiteProxyUrl.trim());
  }
  if (partial.dlsiteProxyEnabled !== undefined) {
    writeKey(KEYS.dlsiteProxyEnabled, partial.dlsiteProxyEnabled ? "1" : "0");
  }
  if (partial.dlsiteMinIntervalMs !== undefined) {
    const n = Number(partial.dlsiteMinIntervalMs);
    const value = Number.isFinite(n)
      ? clampInterval(n)
      : DEFAULT_DLSITE_MIN_INTERVAL_MS;
    writeKey(KEYS.dlsiteMinIntervalMs, String(value));
  }
  if (partial.libraryRoots !== undefined) {
    const cleaned = partial.libraryRoots
      .map((s) => s.trim())
      .filter(Boolean);
    writeKey(KEYS.libraryRoots, cleaned.join("\n"));
  }
  if (partial.coversDir !== undefined) {
    writeKey(KEYS.coversDir, partial.coversDir.trim());
  }
  return getSettings();
}

export function getDlsiteMinIntervalMs(): number {
  return getSettings().dlsiteMinIntervalMs;
}

export function getDlsiteProxyUrl(): string | null {
  const s = getSettings();
  if (!s.dlsiteProxyEnabled) return null;
  const url = s.dlsiteProxyUrl.trim();
  return url || null;
}
