"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanEvent } from "@/lib/scanner";
import type { DurationScanEvent } from "@/lib/duration-scanner";

type ScanResult = {
  worksFound: number;
  worksNew: number;
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

const INITIAL_STATE: ScanProgressState = {
  total: 0,
  index: 0,
  currentStatus: "Preparing…",
  lastCoverVersion: 0,
  log: [],
  errorCount: 0,
  finished: false,
};

export type ScanMode =
  | { kind: "library"; force?: boolean }
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
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [state, setState] = useState<ScanProgressState>(INITIAL_STATE);
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
          currentStatus: `Found ${ev.total} works in library`,
          log: pushLog(prev, `Found ${ev.total} works`),
        };
      case "work-start":
        return {
          ...prev,
          index: ev.index,
          total: ev.total,
          currentWorkId: ev.workId,
          currentTitle: undefined,
          currentStatus: ev.hadExisting
            ? `Checking ${ev.workId}`
            : `New work ${ev.workId}`,
          log: pushLog(
            prev,
            `[${ev.index}/${ev.total}] ${ev.workId}${ev.hadExisting ? "" : " (new)"}`,
          ),
        };
      case "fetch-meta":
        return {
          ...prev,
          currentStatus: `Fetching metadata for ${ev.workId}…`,
          log: pushLog(prev, `  → fetching metadata`),
        };
      case "meta-result":
        return {
          ...prev,
          currentTitle: ev.title ?? prev.currentTitle,
          currentStatus: ev.found
            ? `${ev.source ?? "metadata"}: ${ev.title ?? ev.workId}`
            : `No metadata found for ${ev.workId}`,
          log: pushLog(
            prev,
            ev.found
              ? `  ✓ ${ev.source} — ${ev.title ?? ""}`
              : `  ✗ no metadata`,
          ),
        };
      case "fetch-cover":
        return {
          ...prev,
          currentStatus: `Downloading cover for ${ev.workId}…`,
          log: pushLog(prev, `  → cover ${ev.url}`),
        };
      case "cover-saved":
        return {
          ...prev,
          lastCoverWorkId: ev.workId,
          lastCoverVersion: prev.lastCoverVersion + 1,
          currentStatus: `Saved cover for ${ev.workId}`,
          log: pushLog(prev, `  ✓ cover saved`),
        };
      case "meta-skipped":
        return {
          ...prev,
          currentStatus: `${ev.workId}: metadata up to date`,
          log: pushLog(prev, `  • metadata up to date`),
        };
      case "tracks-done":
        return {
          ...prev,
          currentStatus: `${ev.workId}: ${ev.tracks} tracks indexed`,
          log: pushLog(prev, `  • ${ev.tracks} tracks`),
        };
      case "work-done":
        return prev;
      case "error":
        return {
          ...prev,
          errorCount: prev.errorCount + 1,
          log: pushLog(prev, `  ! ${ev.message}`),
        };
      case "done":
        return {
          ...prev,
          result: ev.result,
          finished: true,
          currentStatus: `Done — ${ev.result.worksFound} works, ${ev.result.tracksScanned} tracks`,
          log: pushLog(
            prev,
            `Done. works=${ev.result.worksFound} new=${ev.result.worksNew} tracks=${ev.result.tracksScanned} meta=${ev.result.metadataFetched} errors=${ev.result.errors.length}`,
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
              ? "All tracks already have durations"
              : `Reading durations for ${ev.total} tracks`,
          log: pushLog(
            prev,
            ev.total === 0
              ? "No tracks need duration scan"
              : `Reading durations for ${ev.total} tracks`,
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
          currentStatus: `Done — ${ev.result.updated} updated, ${ev.result.errors} errors`,
          log: pushLog(
            prev,
            `Done. scanned=${ev.result.scanned} updated=${ev.result.updated} errors=${ev.result.errors}`,
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
        ? "Reading durations for all tracks…"
        : "Reading missing track durations…";
    } else if (mode.force) {
      url = "/api/scan?force=1";
      startMsg = "Starting full rescan…";
    } else {
      url = "/api/scan";
      startMsg = "Starting scan…";
    }

    setState({ ...INITIAL_STATE, log: [startMsg], currentStatus: startMsg });
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
          currentStatus: `Scan failed: ${String(err)}`,
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
          {busy ? "Scanning library" : state.finished ? "Scan complete" : "Scan"}
          {state.total > 0 && (
            <span className="text-muted-foreground text-xs">
              {state.index}/{state.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onToggleMinimize} aria-label={minimized ? "Expand" : "Collapse"}>
            {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={busy ? "Cancel scan" : "Close"}>
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
                  no cover yet
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
                  {state.errorCount} error{state.errorCount === 1 ? "" : "s"}
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
