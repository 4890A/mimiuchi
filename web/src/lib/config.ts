import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function resolveDir(envVar: string, fallback: string): string {
  const v = process.env[envVar];
  return v ? path.resolve(v) : fallback;
}

const projectRoot = path.resolve(process.cwd(), "..");

const DEFAULT_LIBRARY_ROOT = resolveDir(
  "KIKOERU_LIBRARY_ROOT",
  path.join(projectRoot, "media"),
);
const DEFAULT_COVERS_DIR = resolveDir(
  "KIKOERU_COVERS_DIR",
  path.join(projectRoot, "covers"),
);
export const DATA_DIR = resolveDir(
  "KIKOERU_DATA_DIR",
  path.join(projectRoot, "data"),
);

export const LIBRARY_ROOT = DEFAULT_LIBRARY_ROOT;
export const COVERS_DIR = DEFAULT_COVERS_DIR;

export function resolveLibraryRoot(override?: string | null): string {
  return override?.trim() ? path.resolve(override.trim()) : DEFAULT_LIBRARY_ROOT;
}
export function resolveCoversDir(override?: string | null): string {
  return override?.trim() ? path.resolve(override.trim()) : DEFAULT_COVERS_DIR;
}

function loadOrCreateSessionSecret(): string {
  if (process.env.KIKOERU_SESSION_SECRET) return process.env.KIKOERU_SESSION_SECRET;
  const file = path.join(DATA_DIR, "session-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const SESSION_SECRET = loadOrCreateSessionSecret();
export const PASSWORD = process.env.KIKOERU_PASSWORD ?? "changeme";
