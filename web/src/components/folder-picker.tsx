"use client";

import { useCallback, useState } from "react";
import {
  ArrowUp,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
} from "lucide-react";
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
import type { FolderListing } from "@/app/api/folders/route";

/**
 * "Browse…" for a folder on the machine running the server. Works from a phone
 * too, since it lists the server's folders rather than the browser's.
 */
export function FolderPicker({
  onPick,
  startAt,
  label,
}: {
  onPick: (path: string) => void;
  /** Folder to open at; the drive list when absent. */
  startAt?: string;
  label?: string;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (target: string | null) => {
    setLoading(true);
    try {
      const qs = target ? `?path=${encodeURIComponent(target)}` : "";
      const res = await fetch(`/api/folders${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setListing((await res.json()) as FolderListing);
    } catch (err) {
      setListing({
        path: target,
        parent: null,
        folders: [],
        workCount: 0,
        truncated: false,
        error: String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const atTop = listing?.path == null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load(startAt ?? null);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <FolderOpen className="h-4 w-4" />
        {label ?? t("folders.browse")}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("folders.title")}</DialogTitle>
          <DialogDescription>{t("folders.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={atTop || loading}
            onClick={() => void load(listing?.parent ?? null)}
            aria-label={t("folders.up")}
            title={t("folders.up")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <div
            className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs"
            title={listing?.path ?? undefined}
          >
            {atTop ? t("folders.thisComputer") : listing?.path}
          </div>
        </div>

        {/* Shrinks on short screens (a phone held sideways) so the buttons
            below stay reachable. */}
        <div className="h-[min(18rem,35dvh)] min-h-24 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : listing?.error ? (
            <p className="p-3 text-sm text-destructive">
              {t("folders.cannotOpen", { error: listing.error })}
            </p>
          ) : listing && listing.folders.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {t("folders.noSubfolders")}
            </p>
          ) : (
            <ul className="divide-y">
              {listing?.folders.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => void load(f.path)}
                  >
                    {atTop ? (
                      <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!atTop && !loading && !listing?.error && (
          <p
            className={
              listing && listing.workCount > 0
                ? "text-sm text-emerald-600 dark:text-emerald-400"
                : "text-sm text-muted-foreground"
            }
          >
            {listing && listing.workCount > 0
              ? t("folders.worksHere", { count: listing.workCount })
              : t("folders.noWorksHere")}
          </p>
        )}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button
            type="button"
            disabled={atTop || loading || Boolean(listing?.error)}
            onClick={() => {
              if (listing?.path) {
                onPick(listing.path);
                setOpen(false);
              }
            }}
          >
            {t("folders.choose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
