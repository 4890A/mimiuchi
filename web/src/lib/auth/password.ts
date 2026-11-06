import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../config";

/**
 * Where the login password comes from.
 *
 * - `env`: `KIKOERU_PASSWORD` is set. It always wins, so Docker and existing
 *   `.env.local` installs behave exactly as before.
 * - `stored`: chosen in the app on first run, kept as a scrypt hash in
 *   `<DATA_DIR>/password`.
 * - `unset`: neither. The app sends every visitor to `/setup` to choose one.
 *   There used to be a silent `changeme` default here, which on a server
 *   listening on the whole LAN was a password everyone knew.
 *
 * The hash lives in a file, not the settings table, so a backup never carries
 * it and a restore can never swap the password out from under you. It also
 * makes recovery simple: delete the file and the app asks for a new password.
 */
export type PasswordSource = "env" | "stored" | "unset";

export const MIN_PASSWORD_LENGTH = 4;

const PASSWORD_FILE = path.join(DATA_DIR, "password");

// Interactive-login cost: ~50ms. N=2^15 needs 32MB, above scrypt's default
// 32MB cap once overhead is counted, so maxmem is raised to match.
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function envPassword(): string | null {
  const v = process.env.KIKOERU_PASSWORD;
  return v ? v : null;
}

function readStoredHash(): string | null {
  try {
    const s = fs.readFileSync(PASSWORD_FILE, "utf8").trim();
    return s || null;
  } catch {
    return null;
  }
}

export function passwordSource(): PasswordSource {
  if (envPassword() !== null) return "env";
  return readStoredHash() !== null ? "stored" : "unset";
}

export function setupNeeded(): boolean {
  return passwordSource() === "unset";
}

function hash(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    key.toString("hex"),
  ].join("$");
}

function verifyHash(password: string, stored: string): boolean {
  const [scheme, n, r, p, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = crypto.scryptSync(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM },
  );
  return crypto.timingSafeEqual(actual, expected);
}

/** Constant-time compare for strings of any length. */
function equalStrings(a: string, b: string): boolean {
  const da = crypto.createHash("sha256").update(a).digest();
  const db = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

export function verifyPassword(password: string): boolean {
  const env = envPassword();
  if (env !== null) return equalStrings(password, env);
  const stored = readStoredHash();
  return stored !== null && verifyHash(password, stored);
}

export class PasswordAlreadySetError extends Error {
  constructor() {
    super("a password has already been set");
    this.name = "PasswordAlreadySetError";
  }
}

/**
 * Stores the first password. Creates the file exclusively, so two people
 * racing through `/setup` cannot both win. The second gets
 * `PasswordAlreadySetError`.
 */
export function createPassword(password: string): void {
  if (envPassword() !== null) throw new PasswordAlreadySetError();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    fs.writeFileSync(PASSWORD_FILE, hash(password) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PasswordAlreadySetError();
    }
    throw err;
  }
}

/** Replaces a stored password. The caller has already checked the old one. */
export function replacePassword(password: string): void {
  const tmp = `${PASSWORD_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, hash(password) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, PASSWORD_FILE);
}

/**
 * A short fingerprint of the stored hash, kept in the session. Changing the
 * password changes it, which signs out every other device. `null` for an env
 * password: those sessions never carried one, and changing the env var
 * already means a restart.
 */
export function passwordVersion(): string | null {
  if (envPassword() !== null) return null;
  const stored = readStoredHash();
  if (stored === null) return null;
  return crypto.createHash("sha256").update(stored).digest("hex").slice(0, 16);
}

export const PASSWORD_FILE_PATH = PASSWORD_FILE;
