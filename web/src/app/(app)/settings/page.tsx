import fs from "node:fs";
import { getSettings } from "@/lib/settings";
import { DATA_DIR, resolveLibraryRoots, resolveCoversDir } from "@/lib/config";
import { passwordSource } from "@/lib/auth/password";
import { PasswordSettings } from "./password-settings";
import { listWorkIdsMissingSeiyuu, listMissingWorks } from "@/lib/db/repository";
import { SettingsForm } from "./settings-form";
import { BackupRestore } from "@/components/backup-restore";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getTranslations();
  const settings = getSettings();
  const libraryRoots = resolveLibraryRoots(settings.libraryRoots);
  const effective = {
    libraryRoots,
    coversDir: resolveCoversDir(settings.coversDir),
    // Flag a folder that is not there now, so a typo or an unplugged drive is
    // visible here instead of as a scan that quietly finds nothing.
    missingRoots: libraryRoots.filter((r) => {
      try {
        return !fs.statSync(r).isDirectory();
      } catch {
        return true;
      }
    }),
    dataDir: DATA_DIR,
  };
  const missingSeiyuuCount = listWorkIdsMissingSeiyuu().length;
  const missingWorks = listMissingWorks().map((w) => ({
    id: w.id,
    title: w.title,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t("settings.title")}
      </h1>
      <SettingsForm
        initial={settings}
        effective={effective}
        missingSeiyuuCount={missingSeiyuuCount}
        missingWorks={missingWorks}
      />
      <div className="mt-6">
        <PasswordSettings source={passwordSource()} />
      </div>
      <div className="mt-8">
        <BackupRestore />
      </div>
    </div>
  );
}
