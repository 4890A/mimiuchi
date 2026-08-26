"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { clearWorkProgress } from "@/lib/actions";
import { usePlayer } from "@/components/player/player-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslations } from "@/lib/i18n/client";

/**
 * Wipes a work's stored play positions, which is also what takes it off the
 * library's "on deck" row — that list is a projection of exactly these rows.
 *
 * Only rendered when there is progress to clear, so it disappears after use.
 * Clearing while a track of this work is playing is allowed and does not
 * interrupt it; the player will start banking a position again from wherever it
 * has got to, which is the honest answer for something being played right now.
 */
export function ClearProgressButton({
  workId,
  workTitle,
  trackIds,
}: {
  workId: string;
  workTitle: string;
  /** Every track of the work, so the in-session positions go too. */
  trackIds: number[];
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const p = usePlayer();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        {t("work.clearProgress")}
        <RotateCcw className="h-3 w-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("work.clearProgressTitle")}</DialogTitle>
          <DialogDescription>
            {t("work.clearProgressBefore")}
            <span className="font-medium text-foreground">{workTitle}</span>
            {t("work.clearProgressAfter")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const r = await clearWorkProgress(workId);
                if (!r.ok) {
                  toast.error(t("work.clearProgressFailed", { error: r.error }));
                  return;
                }
                // The refreshed page brings back `progress: null`, but the
                // positions banked this session live in the client and would
                // otherwise keep the bars up.
                p.forgetProgress(trackIds);
                toast.success(t("work.clearProgressDone"));
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {pending
              ? t("work.clearProgressPending")
              : t("work.clearProgressConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
