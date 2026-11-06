"use server";
import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { getSession, isSessionValid, signIn } from "./session";
import {
  MIN_PASSWORD_LENGTH,
  PasswordAlreadySetError,
  createPassword,
  passwordSource,
  replacePassword,
  setupNeeded,
  verifyPassword,
} from "./password";
import { resolveLibraryRoots } from "../config";
import { getSettings, setSettings } from "../settings";
import { parsePathList } from "../paths";

/** Only same-site paths, so `?from=` cannot bounce a login off-site. */
function safeReturnPath(raw: FormDataEntryValue | null): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function loginAction(formData: FormData): Promise<void> {
  if (setupNeeded()) redirect("/setup");
  const password = String(formData.get("password") ?? "");
  const from = safeReturnPath(formData.get("from"));
  if (!verifyPassword(password)) {
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
  }
  await signIn(await getSession());
  redirect(from);
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// First run
// ---------------------------------------------------------------------------

export type FormError =
  | { code: "passwordTooShort"; min: number }
  | { code: "passwordMismatch" }
  | { code: "noFolders" }
  | { code: "folderMissing"; paths: string[] }
  | { code: "alreadySetUp" }
  | { code: "wrongPassword" }
  | { code: "managedByEnv" };

export type FormState = { error?: FormError; ok?: boolean };

function checkNewPassword(formData: FormData): FormError | string {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { code: "passwordTooShort", min: MIN_PASSWORD_LENGTH };
  }
  if (password !== confirm) return { code: "passwordMismatch" };
  return password;
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The setup page's form: library folders and a password, in one go.
 *
 * Validates everything before writing anything, so a typo in a folder path
 * does not leave the password half-set. The password is written last and
 * exclusively, which is what closes setup for good.
 */
export async function setupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!setupNeeded()) return { error: { code: "alreadySetUp" } };

  const roots = parsePathList(String(formData.get("folders") ?? "")).map(
    (p) => path.resolve(/*turbopackIgnore: true*/ p),
  );
  if (roots.length === 0) return { error: { code: "noFolders" } };
  const missing = roots.filter((r) => !isDirectory(r));
  if (missing.length > 0) {
    return { error: { code: "folderMissing", paths: missing } };
  }

  const password = checkNewPassword(formData);
  if (typeof password !== "string") return { error: password };

  // Keep an env-configured root as the env's to manage: only write the
  // Settings value, which overrides the env var, when it says something else.
  const envRoots = resolveLibraryRoots([]);
  const sameAsEnv =
    !process.env.KIKOERU_LIBRARY_ROOT
      ? false
      : roots.length === envRoots.length && roots.every((r, i) => r === envRoots[i]);
  if (!sameAsEnv) setSettings({ libraryRoots: roots });

  try {
    createPassword(password);
  } catch (err) {
    if (err instanceof PasswordAlreadySetError) {
      return { error: { code: "alreadySetUp" } };
    }
    throw err;
  }

  await signIn(await getSession());
  redirect("/?welcome=1");
}

/** Folders to suggest on the setup page: whatever is already configured and
 *  actually exists (an env var, or Settings left over from a reset). */
export async function suggestedSetupFolders(): Promise<string[]> {
  return resolveLibraryRoots(getSettings().libraryRoots).filter(isDirectory);
}

// ---------------------------------------------------------------------------
// Settings → Password
// ---------------------------------------------------------------------------

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!isSessionValid(session)) redirect("/login");
  if (passwordSource() === "env") return { error: { code: "managedByEnv" } };

  if (!verifyPassword(String(formData.get("current") ?? ""))) {
    return { error: { code: "wrongPassword" } };
  }
  const password = checkNewPassword(formData);
  if (typeof password !== "string") return { error: password };

  replacePassword(password);
  // Re-stamp this session with the new version; every other device's session
  // still carries the old one and is signed out.
  await signIn(session);
  return { ok: true };
}
