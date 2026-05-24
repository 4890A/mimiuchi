"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import { revealWorkFolder } from "@/lib/actions";

export function RevealFolderButton({ workId }: { workId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const r = await revealWorkFolder(workId);
          if (!r.ok) toast.error(`Couldn't open folder: ${r.error}`);
        });
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      Open folder
      <FolderOpen className="h-3 w-3" />
    </button>
  );
}
