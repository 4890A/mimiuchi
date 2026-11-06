export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { setupNeeded } from "@/lib/auth/password";
import { suggestedSetupFolders } from "@/lib/auth/actions";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";
import { LanguageToggle } from "@/components/language-toggle";
import { SetupForm } from "./setup-form";

/**
 * First run: choose library folders and a password. Reachable only until a
 * password exists; after that it bounces to the library (or to the login page,
 * via the proxy, when not signed in).
 */
export default async function SetupPage() {
  if (!setupNeeded()) redirect("/");
  const [locale, { t }, folders] = await Promise.all([
    getLocale(),
    getTranslations(),
    suggestedSetupFolders(),
  ]);
  return (
    <LocaleProvider locale={locale}>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4 py-10">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">耳打ち</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("setup.subtitle")}
            </p>
          </div>
          <SetupForm initialFolders={folders} />
          <div className="mt-6">
            <LanguageToggle current={locale} />
          </div>
        </div>
      </div>
    </LocaleProvider>
  );
}
