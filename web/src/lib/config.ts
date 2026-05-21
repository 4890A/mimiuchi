import "server-only";
import path from "node:path";

function resolveDir(envVar: string, fallback: string): string {
  const v = process.env[envVar];
  return v ? path.resolve(v) : fallback;
}

const projectRoot = path.resolve(process.cwd(), "..");

export const LIBRARY_ROOT = resolveDir(
  "KIKOERU_LIBRARY_ROOT",
  path.join(projectRoot, "media"),
);
export const COVERS_DIR = resolveDir(
  "KIKOERU_COVERS_DIR",
  path.join(projectRoot, "covers"),
);
export const DATA_DIR = resolveDir(
  "KIKOERU_DATA_DIR",
  path.join(projectRoot, "data"),
);

export const SESSION_SECRET =
  process.env.KIKOERU_SESSION_SECRET ?? "insecure-dev-secret-please-change-me";
export const PASSWORD = process.env.KIKOERU_PASSWORD ?? "changeme";
