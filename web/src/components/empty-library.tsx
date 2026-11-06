"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useScanProgress } from "@/components/scan-progress";
import { useTranslations } from "@/lib/i18n/client";

/**
 * What an empty library shows: what to do next, not just that nothing is here.
 *
 * Straight after first-run setup (`?welcome=1`) it starts the first scan on its
 * own, so the first thing a new user sees is their library filling in.
 */
export function EmptyLibrary({
  welcome,
  noFolders,
}: {
  welcome: boolean;
  /** None of the configured library folders exist. */
  noFolders: boolean;
}) {
  const { t } = useTranslations();
  const scan = useScanProgress();
  const started = useRef(false);

  useEffect(() => {
    if (!welcome || started.current) return;
    started.current = true;
    // Drop the flag without a navigation, so a reload does not scan again.
    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", url);
    if (!noFolders) void scan.start({ kind: "library" });
    // `scan` is a fresh object each render; this runs once by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcome, noFolders]);

  return (
    <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
      <p className="text-lg font-medium">{t("library.empty.title")}</p>
      {noFolders ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("library.empty.noFolders")}
          </p>
          <Link href="/settings" className={buttonVariants({ className: "mt-4" })}>
            {t("library.empty.openSettings")}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("library.empty.before")}
            <code className="rounded bg-muted px-1.5 py-0.5">RJ123456</code>
            {t("library.empty.after")}
          </p>
          <Button
            className="mt-4"
            disabled={scan.busy}
            onClick={() => void scan.start({ kind: "library" })}
          >
            <RefreshCw className={scan.busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("header.scanLibrary")}
          </Button>
        </>
      )}
      {scan.panel}
    </div>
  );
}
