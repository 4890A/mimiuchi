import { getSettings } from "@/lib/settings";
import { resolveLibraryRoots, resolveCoversDir } from "@/lib/config";
import { listWorkIdsMissingSeiyuu } from "@/lib/db/repository";
import { SettingsForm } from "./settings-form";
import { BackupRestore } from "@/components/backup-restore";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getTranslations();
  const settings = getSettings();
  const effective = {
    libraryRoots: resolveLibraryRoots(settings.libraryRoots),
    coversDir: resolveCoversDir(settings.coversDir),
  };
  const missingSeiyuuCount = listWorkIdsMissingSeiyuu().length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t("settings.title")}
      </h1>
      <SettingsForm
        initial={settings}
        effective={effective}
        missingSeiyuuCount={missingSeiyuuCount}
      />
      <div className="mt-8">
        <BackupRestore />
      </div>
    </div>
  );
}
