import { getSettings } from "@/lib/settings";
import { resolveLibraryRoot, resolveCoversDir } from "@/lib/config";
import { listWorkIdsMissingSeiyuu } from "@/lib/db/repository";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = getSettings();
  const effective = {
    libraryRoot: resolveLibraryRoot(settings.libraryRoot),
    coversDir: resolveCoversDir(settings.coversDir),
  };
  const missingSeiyuuCount = listWorkIdsMissingSeiyuu().length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm
        initial={settings}
        effective={effective}
        missingSeiyuuCount={missingSeiyuuCount}
      />
    </div>
  );
}
