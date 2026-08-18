"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import { revealWorkFolder } from "@/lib/actions";
import { useTranslations } from "@/lib/i18n/client";

export function RevealFolderButton({
  workId,
  isArchive = false,
}: {
  workId: string;
  isArchive?: boolean;
}) {
  const { t } = useTranslations();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const r = await revealWorkFolder(workId);
          if (!r.ok) toast.error(t("work.openFolderFailed", { error: r.error }));
        });
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {isArchive ? t("work.showArchive") : t("work.openFolder")}
      <FolderOpen className="h-3 w-3" />
    </button>
  );
}
