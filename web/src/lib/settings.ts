import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { settings as settingsTable } from "./db/schema";

export interface AppSettings {
  dlsiteProxyUrl: string;
  dlsiteProxyEnabled: boolean;
  /** One or more library roots. Empty array → use env default. */
  libraryRoots: string[];
  coversDir: string;
}

const KEYS = {
  dlsiteProxyUrl: "dlsite.proxy.url",
  dlsiteProxyEnabled: "dlsite.proxy.enabled",
  libraryRoots: "scan.libraryRoot",
  coversDir: "scan.coversDir",
} as const;

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

export function getSettings(): AppSettings {
  return {
    dlsiteProxyUrl: readKey(KEYS.dlsiteProxyUrl) ?? "",
    dlsiteProxyEnabled: readKey(KEYS.dlsiteProxyEnabled) === "1",
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

export function getDlsiteProxyUrl(): string | null {
  const s = getSettings();
  if (!s.dlsiteProxyEnabled) return null;
  const url = s.dlsiteProxyUrl.trim();
  return url || null;
}
