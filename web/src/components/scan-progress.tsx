"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import type { ScanEvent } from "@/lib/scanner";
import type { DurationScanEvent } from "@/lib/duration-scanner";

type ScanResult = {
  worksFound: number;
  worksNew: number;
  worksSkipped: number;
  tracksScanned: number;
  metadataFetched: number;
  errors: string[];
};

interface ScanProgressState {
  total: number;
  index: number;
  currentWorkId?: string;
  currentTitle?: string;
  currentStatus: string;
  lastCoverWorkId?: string;
  lastCoverVersion: number;
  log: string[];
  result?: ScanResult;
  errorCount: number;
  finished: boolean;
}

function initialState(t: TFunction): ScanProgressState {
  return {
    total: 0,
    index: 0,
    currentStatus: t("scan.status.preparing"),
    lastCoverVersion: 0,
    log: [],
    errorCount: 0,
    finished: false,
  };
}

export type ScanMode =
  | { kind: "library"; force?: boolean; missingSeiyuu?: boolean; extras?: boolean }
  | { kind: "durations"; all?: boolean };

export interface ScanProgressHandle {
  start: (mode?: ScanMode) => Promise<void>;
  busy: boolean;
}

export function useScanProgress(): {
  busy: boolean;
  start: (mode?: ScanMode) => Promise<void>;
  panel: React.ReactNode;
} {
  const router = useRouter();
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [state, setState] = useState<ScanProgressState>(() => initialState(t));
  const [mounted, setMounted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function pushLog(prev: ScanProgressState, line: string): string[] {
    const next = [...prev.log, line];
    return next.length > 80 ? next.slice(-80) : next;
  }

  function apply(prev: ScanProgressState, ev: ScanEvent): ScanProgressState {
    switch (ev.type) {
      case "start":
        return {
          ...prev,
          total: ev.total,
          currentStatus:
            ev.total === 0
              ? t("scan.status.allUpToDate")
              : t("scan.status.scanningWorks", { count: ev.total }),
          log: pushLog(
            prev,
            ev.total === 0
              ? t("scan.log.allUpToDate")
              : t("scan.log.scanningWorks", { count: ev.total }),
          ),
        };
      case "work-start":
        return {
          ...prev,
          index: ev.index,
          total: ev.total,
          currentWorkId: ev.workId,
          currentTitle: undefined,
          currentStatus: ev.hadExisting
            ? t("scan.status.checking", { id: ev.workId })
            : t("scan.status.newWork", { id: ev.workId }),
          log: pushLog(
            prev,
            `[${ev.index}/${ev.total}] ${ev.workId}${ev.hadExisting ? "" : t("scan.log.newSuffix")}${ev.isArchive ? t("scan.log.archiveSuffix") : ""}`,
          ),
        };
      case "fetch-meta":
        return {
          ...prev,
          currentStatus: t("scan.status.fetchingMeta", { id: ev.workId }),
          log: pushLog(prev, t("scan.log.fetchingMeta")),
        };
      case "meta-retry":
        return {
          ...prev,
          currentStatus: t("scan.status.metaRetry", { id: ev.workId }),
          log: pushLog(
            prev,
            t("scan.log.metaRetry", {
              reason: ev.reason,
              seconds: Math.round(ev.delayMs / 100) / 10,
            }),
          ),
        };
      case "meta-cooldown":
        return {
          ...prev,
          currentStatus: t("scan.status.metaCooldown"),
          log: pushLog(
            prev,
            t("scan.log.metaCooldown", {
              seconds: Math.round(ev.delayMs / 1000),
            }),
          ),
        };
      case "meta-result":
        return {
          ...prev,
          currentTitle: ev.title ?? prev.currentTitle,
          currentStatus: ev.found
            ? `${ev.source ?? "metadata"}: ${ev.title ?? ev.workId}`
            : t("scan.status.noMeta", { id: ev.workId }),
          log: pushLog(
            prev,
            ev.found
              ? `  ✓ ${ev.source} — ${ev.title ?? ""}`
              : t("scan.log.noMeta"),
          ),
        };
      case "fetch-cover":
        return {
          ...prev,
          currentStatus: t("scan.status.downloadingCover", { id: ev.workId }),
          log: pushLog(prev, t("scan.log.cover", { url: ev.url })),
        };
      case "cover-saved":
        return {
          ...prev,
          lastCoverWorkId: ev.workId,
          lastCoverVersion: prev.lastCoverVersion + 1,
          currentStatus: t("scan.status.coverSaved", { id: ev.workId }),
          log: pushLog(prev, t("scan.log.coverSaved")),
        };
      case "meta-skipped":
        return {
          ...prev,
          currentStatus: t("scan.status.metaUpToDate", { id: ev.workId }),
          log: pushLog(prev, t("scan.log.metaUpToDate")),
        };
      case "tracks-done":
        return {
          ...prev,
          currentStatus: t("scan.status.tracksIndexed", {
            id: ev.workId,
            count: ev.tracks,
          }),
          log: pushLog(prev, t("scan.log.tracks", { count: ev.tracks })),
        };
      case "roots-unverified":
        // Counted as an error on purpose: the scan finished, but it could not
        // tell "deleted" from "drive not plugged in", so it changed nothing.
        return {
          ...prev,
          errorCount: prev.errorCount + 1,
          currentStatus: t("scan.status.rootsUnverified"),
          log: pushLog(
            prev,
            t("scan.log.rootsUnverified", { roots: ev.roots.join(", ") }),
          ),
        };
      case "missing-reconciled":
        return {
          ...prev,
          log: pushLog(
            prev,
            t("scan.log.missingReconciled", {
              marked: ev.marked,
              restored: ev.restored,
            }),
          ),
        };
      case "work-done":
        return prev;
      case "error":
        return {
          ...prev,
          errorCount: prev.errorCount + 1,
          log: pushLog(prev, `  ! ${ev.message}`),
        };
      case "durations-start":
        return {
          ...prev,
          index: 0,
          total: ev.total,
          currentWorkId: undefined,
          currentTitle: undefined,
          currentStatus:
            ev.total === 0
              ? t("scan.status.allDurations")
              : t("scan.status.readingNewDurations", { count: ev.total }),
          log: pushLog(
            prev,
            ev.total === 0
              ? t("scan.log.noNewDurations")
              : t("scan.log.readingNewDurations", { count: ev.total }),
          ),
        };
      case "durations-track":
        return {
          ...prev,
          index: ev.index,
          total: ev.total,
          currentWorkId: ev.workId,
          currentTitle: ev.relativePath,
          currentStatus: `[${ev.index}/${ev.total}] ${ev.relativePath}`,
        };
      case "durations-done":
        return {
          ...prev,
          log: pushLog(
            prev,
            t("scan.log.durationsSummary", {
              updated: ev.updated,
              errors: ev.errors,
            }),
          ),
        };
      case "done":
        return {
          ...prev,
          result: ev.result,
          finished: true,
          currentStatus: t("scan.status.doneWorks", {
            found: ev.result.worksFound,
            skipped: ev.result.worksSkipped,
          }),
          log: pushLog(
            prev,
            t("scan.log.doneWorks", {
              found: ev.result.worksFound,
              added: ev.result.worksNew,
              skipped: ev.result.worksSkipped,
              tracks: ev.result.tracksScanned,
              meta: ev.result.metadataFetched,
              errors: ev.result.errors.length,
            }),
          ),
        };
      default:
        return prev;
    }
  }

  function applyDuration(
    prev: ScanProgressState,
    ev: DurationScanEvent,
  ): ScanProgressState {
    switch (ev.type) {
      case "start":
        return {
          ...prev,
          total: ev.total,
          currentStatus:
            ev.total === 0
              ? t("scan.status.allDurations")
              : t("scan.status.readingDurations", { count: ev.total }),
          log: pushLog(
            prev,
            ev.total === 0
              ? t("scan.log.noDurations")
              : t("scan.log.readingDurations", { count: ev.total }),
          ),
        };
      case "track-start":
        return {
          ...prev,
          index: ev.index,
          total: ev.total,
          currentWorkId: ev.workId,
          currentTitle: ev.relativePath,
          currentStatus: `[${ev.index}/${ev.total}] ${ev.relativePath}`,
        };
      case "track-done": {
        const m = Math.floor(ev.durationSeconds / 60);
        const s = Math.floor(ev.durationSeconds % 60)
          .toString()
          .padStart(2, "0");
        return {
          ...prev,
          log: pushLog(prev, `  ✓ ${m}:${s}`),
        };
      }
      case "track-error":
        return {
          ...prev,
          errorCount: prev.errorCount + 1,
          log: pushLog(prev, `  ! ${ev.message}`),
        };
      case "done":
        return {
          ...prev,
          finished: true,
          currentStatus: t("scan.status.doneDurations", {
            updated: ev.result.updated,
            errors: ev.result.errors,
          }),
          log: pushLog(
            prev,
            t("scan.log.doneDurations", {
              scanned: ev.result.scanned,
              updated: ev.result.updated,
              errors: ev.result.errors,
            }),
          ),
        };
      default:
        return prev;
    }
  }

  async function start(mode: ScanMode = { kind: "library" }) {
    if (busy) return;
    setBusy(true);
    setOpen(true);
    setMinimized(false);

    let url: string;
    let startMsg: string;
    if (mode.kind === "durations") {
      url = mode.all ? "/api/scan/durations?all=1" : "/api/scan/durations";
      startMsg = mode.all
        ? t("scan.start.durationsAll")
        : t("scan.start.durationsMissing");
    } else if (mode.extras) {
      url = "/api/scan?mode=extras";
      startMsg = t("scan.start.extras");
    } else if (mode.missingSeiyuu) {
      url = "/api/scan?mode=missing-seiyuu";
      startMsg = t("scan.start.missingSeiyuu");
    } else if (mode.force) {
      url = "/api/scan?force=1";
      startMsg = t("scan.start.force");
    } else {
      url = "/api/scan";
      startMsg = t("scan.start.scan");
    }

    setState({ ...initialState(t), log: [startMsg], currentStatus: startMsg });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(url, { method: "POST", signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`scan failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (mode.kind === "durations") {
              setState((prev) => applyDuration(prev, ev as DurationScanEvent));
            } else {
              setState((prev) => apply(prev, ev as ScanEvent));
            }
          } catch {}
        }
      }
      router.refresh();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((prev) => ({
          ...prev,
          currentStatus: t("scan.status.failed", { error: String(err) }),
          log: pushLog(prev, `! ${String(err)}`),
          finished: true,
        }));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const panel =
    open && mounted
      ? createPortal(
          <ScanPanel
            state={state}
            busy={busy}
            minimized={minimized}
            onToggleMinimize={() => setMinimized((m) => !m)}
            onClose={() => {
              if (busy) abortRef.current?.abort();
              setOpen(false);
            }}
          />,
          document.body,
        )
      : null;

  return { busy, start, panel };
}

function ScanPanel({
  state,
  busy,
  minimized,
  onToggleMinimize,
  onClose,
}: {
  state: ScanProgressState;
  busy: boolean;
  minimized: boolean;
  onToggleMinimize: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.log]);

  const pct = state.total > 0 ? Math.round((state.index / state.total) * 100) : busy ? 0 : 100;
  const coverSrc = state.lastCoverWorkId
    ? `/api/cover/${state.lastCoverWorkId}?v=${state.lastCoverVersion}`
    : null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg",
        "transition-all",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              busy ? "animate-pulse bg-primary" : state.errorCount ? "bg-destructive" : "bg-emerald-500",
            )}
          />
          {busy
            ? t("scan.panel.scanning")
            : state.finished
              ? t("scan.panel.complete")
              : t("scan.panel.idle")}
          {state.total > 0 && (
            <span className="text-muted-foreground text-xs">
              {state.index}/{state.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleMinimize}
            aria-label={minimized ? t("common.expand") : t("common.collapse")}
          >
            {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={busy ? t("scan.panel.cancel") : t("common.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="h-1 w-full bg-muted">
        <div
          className={cn(
            "h-full bg-primary transition-[width] duration-200",
            busy && state.total === 0 && "animate-pulse",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!minimized && (
        <div className="p-3">
          <div className="flex gap-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={coverSrc}
                  src={coverSrc}
                  alt={state.lastCoverWorkId ?? ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  {t("scan.panel.noCover")}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-medium">
                {state.currentTitle ?? state.currentWorkId ?? "—"}
              </div>
              {state.currentWorkId && state.currentTitle && (
                <div className="truncate text-xs text-muted-foreground">
                  {state.currentWorkId}
                </div>
              )}
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {state.currentStatus}
              </div>
              {state.errorCount > 0 && (
                <div className="mt-1 text-xs text-destructive">
                  {t("scan.panel.errorCount", { count: state.errorCount })}
                </div>
              )}
            </div>
          </div>

          <div
            ref={logRef}
            className="mt-3 max-h-32 overflow-y-auto rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground"
          >
            {state.log.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
