"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteWork } from "@/lib/actions";
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

export function DeleteWorkButton({
  workId,
  workTitle,
}: {
  workId: string;
  workTitle: string;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          />
        }
      >
        {t("delete.trigger")}
        <Trash2 className="h-3 w-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("delete.title")}</DialogTitle>
          <DialogDescription>
            {t("delete.before")}
            <span className="font-medium text-foreground">{workTitle}</span>
            {t("delete.after", { id: workId })}
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
                const r = await deleteWork(workId);
                if (!r.ok) {
                  toast.error(t("delete.failed", { error: r.error }));
                  return;
                }
                toast.success(t("delete.done"));
                setOpen(false);
                router.push("/");
                router.refresh();
              });
            }}
          >
            {pending ? t("delete.deleting") : t("delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
