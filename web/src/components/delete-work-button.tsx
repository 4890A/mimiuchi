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

export function DeleteWorkButton({
  workId,
  workTitle,
}: {
  workId: string;
  workTitle: string;
}) {
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
        Delete entry
        <Trash2 className="h-3 w-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this entry?</DialogTitle>
          <DialogDescription>
            Removes <span className="font-medium text-foreground">{workTitle}</span>{" "}
            ({workId}) from the library, along with its tracks, tags, likes, and
            playback progress. Your audio files on disk are not touched.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const r = await deleteWork(workId);
                if (!r.ok) {
                  toast.error(`Couldn't delete: ${r.error}`);
                  return;
                }
                toast.success("Entry deleted");
                setOpen(false);
                router.push("/");
                router.refresh();
              });
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
