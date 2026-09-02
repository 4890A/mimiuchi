"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  TextSelect,
  XIcon,
} from "lucide-react";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface ReadableScript {
  id: number;
  title: string;
}

interface ReaderApi {
  /** Opens the reader at a script, by its id. No-op if it isn't in the list. */
  openScript: (assetId: number) => void;
  /** Which script ids this reader can show, so callers can hide dead controls. */
  has: (assetId: number) => boolean;
}

const ReaderContext = createContext<ReaderApi | null>(null);

/** Null outside a provider, so a component can degrade instead of throwing. */
export function useScriptReader(): ReaderApi | null {
  return useContext(ReaderContext);
}

const VERTICAL_KEY = "kikoeru.script.vertical";
const SIZE_KEY = "kikoeru.script.size";
const MIN_SIZE = 12;
const MAX_SIZE = 32;
const DEFAULT_SIZE = 18;

function readStored<T>(key: string, parse: (raw: string) => T, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Holds the work's readable 台本 and renders the one reader they all share.
 *
 * A provider rather than props because two very different places open the same
 * reader — a row in the extras panel and an icon on a track row — and mounting
 * a dialog per call site would mean several copies of a 60 KB script in memory
 * and two of them able to be open at once.
 */
export function ScriptReaderProvider({
  scripts,
  children,
}: {
  scripts: ReadableScript[];
  children: React.ReactNode;
}) {
  const { t } = useTranslations();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [texts, setTexts] = useState<Map<number, string | Error>>(new Map());
  // Read straight from localStorage on first render rather than syncing in an
  // effect. Safe from a hydration mismatch because the reader starts closed,
  // so nothing these two values control is in the server's markup at all.
  const [vertical, setVertical] = useState(() =>
    readStored(VERTICAL_KEY, (r) => r !== "0", true),
  );
  const [size, setSize] = useState(() =>
    readStored(
      SIZE_KEY,
      (r) =>
        Math.min(MAX_SIZE, Math.max(MIN_SIZE, parseInt(r, 10) || DEFAULT_SIZE)),
      DEFAULT_SIZE,
    ),
  );
  const bodyRef = useRef<HTMLDivElement>(null);

  const persist = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private browsing, or storage disabled. The preference just won't stick.
    }
  };

  const ids = useMemo(() => new Set(scripts.map((s) => s.id)), [scripts]);
  const api = useMemo<ReaderApi>(
    () => ({
      openScript: (assetId) => {
        const i = scripts.findIndex((s) => s.id === assetId);
        if (i >= 0) setOpenIndex(i);
      },
      has: (assetId) => ids.has(assetId),
    }),
    [scripts, ids],
  );

  const current = openIndex === null ? null : (scripts[openIndex] ?? null);
  const currentText = current ? texts.get(current.id) : undefined;

  // Fetch on open, once per script. Nothing is loaded until the user asks for
  // it, so a work with a dozen scripts costs nothing on page load.
  useEffect(() => {
    if (!current || texts.has(current.id)) return;
    const id = current.id;
    const ac = new AbortController();
    fetch(`/api/asset/${id}?text=1`, { signal: ac.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((text) => setTexts((prev) => new Map(prev).set(id, text)))
      .catch((err) => {
        if (ac.signal.aborted) return;
        setTexts((prev) => new Map(prev).set(id, err as Error));
      });
    return () => ac.abort();
  }, [current, texts]);

  // Back to the start of the new script rather than wherever the last one was.
  // Zero is the start in both modes: a `vertical-rl` box scrolls from 0 at the
  // right edge down to negative values as the text advances leftwards, so
  // there is no need to seek to the far end for vertical.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, [openIndex, vertical, currentText]);

  const go = useCallback(
    (delta: number) => {
      setOpenIndex((i) => {
        if (i === null) return i;
        const next = i + delta;
        return next < 0 || next >= scripts.length ? i : next;
      });
    },
    [scripts.length],
  );

  /**
   * Vertical text scrolls sideways, and a mouse wheel only reports deltaY —
   * so without this the wheel does nothing at all in the reader. Inverted
   * because the text advances leftwards: scrolling "down" should read on.
   */
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!vertical) return;
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft -= e.deltaY;
  };

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      const el = bodyRef.current;
      if (!el) return;

      // The player bar stays live underneath, and its seek and volume sliders
      // answer to the arrow keys too. Only claim a press that is not aimed at
      // something else: focus resting on the page at large still scrolls the
      // script, focus inside a control does not.
      //
      // The popup is found through the DOM rather than a ref because Base UI's
      // Popup does not forward one, and a ref that stays null here would send
      // every key down the early return — silently killing the keyboard.
      const popup = el.closest('[role="dialog"]');
      const target = e.target as Node | null;
      const loose =
        target === document.body || target === document.documentElement;
      if (!loose && (!popup || !target || !popup.contains(target))) return;

      const page = vertical ? el.clientWidth * 0.9 : el.clientHeight * 0.9;
      if (e.key === "PageDown") {
        if (vertical) el.scrollLeft -= page;
        else el.scrollTop += page;
      } else if (e.key === "PageUp") {
        if (vertical) el.scrollLeft += page;
        else el.scrollTop -= page;
      } else if (vertical && e.key === "ArrowLeft") {
        el.scrollLeft -= page;
      } else if (vertical && e.key === "ArrowRight") {
        el.scrollLeft += page;
      } else {
        return;
      }
      e.preventDefault();
    };
    // Capture phase: the dialog stops arrow keys from propagating — they never
    // reach a bubble-phase listener on window, while PageUp/PageDown do. The
    // containment check above is what keeps capturing from stealing the arrows
    // the player's sliders want.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openIndex, vertical]);

  return (
    <ReaderContext.Provider value={api}>
      {children}
      {/*
        Deliberately not modal. Following a 台本 while the track plays is the
        whole point, so the player bar has to stay reachable: `modal={false}`
        leaves the rest of the document interactive, and the popup stops above
        the bar rather than covering it.

        `disablePointerDismissal` goes with that. Without it, reaching for
        pause or the seek bar — now that they are visible and clickable — would
        register as an outside press and shut the reader. Escape and the close
        button remain the ways out.
      */}
      <Dialog
        open={openIndex !== null}
        onOpenChange={(o) => !o && setOpenIndex(null)}
        modal={false}
        disablePointerDismissal
      >
        <DialogPortal>
          {/* No backdrop: it would either dim the player along with everything
              else or have to be cut around it, and the popup below is opaque. */}
          {/* Composed here rather than from DialogContent, which is a small
              padded card — the reader needs the whole viewport above the bar. */}
          {/* No bottom border: the popup stops exactly where the player bar
              starts, and the bar draws its own `border-t` there already. */}
          {/* z-45 — under the player bar (z-50), over the top nav (z-40). The
              bar stays usable here, so anything it opens upwards (the volume
              slider, the seek tooltip) has to land over the reader rather than
              behind it; at a matching z-50 the portal's later DOM order would
              win and clip the flyout. */}
          <DialogPrimitive.Popup className="fixed inset-x-0 top-0 bottom-[var(--player-bar-height,0px)] z-45 flex flex-col bg-background duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
            <DialogPrimitive.Title className="sr-only">
              {current?.title ?? ""}
            </DialogPrimitive.Title>

            <div className="flex shrink-0 items-center gap-1 border-b px-2 py-2 sm:px-3">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => go(-1)}
                disabled={openIndex === 0}
                aria-label={t("script.previous")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => go(1)}
                disabled={
                  openIndex !== null && openIndex >= scripts.length - 1
                }
                aria-label={t("script.next")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <div className="mx-1 min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{current?.title}</p>
                {scripts.length > 1 && (
                  <p className="truncate text-xs text-muted-foreground">
                    {t("script.counter", {
                      index: (openIndex ?? 0) + 1,
                      total: scripts.length,
                    })}
                  </p>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setSize((s) => {
                    const next = Math.max(MIN_SIZE, s - 2);
                    persist(SIZE_KEY, String(next));
                    return next;
                  });
                }}
                aria-label={t("script.textSmaller")}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setSize((s) => {
                    const next = Math.min(MAX_SIZE, s + 2);
                    persist(SIZE_KEY, String(next));
                    return next;
                  });
                }}
                aria-label={t("script.textLarger")}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setVertical((v) => {
                    persist(VERTICAL_KEY, v ? "0" : "1");
                    return !v;
                  });
                }}
                aria-label={t("script.toggleOrientation")}
              >
                <TextSelect
                  className={cn("h-4 w-4", vertical && "rotate-90")}
                />
              </Button>
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" />}
                aria-label={t("common.close")}
              >
                <XIcon className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div
              ref={bodyRef}
              onWheel={onWheel}
              tabIndex={0}
              className={cn(
                "min-h-0 flex-1 px-4 py-6 outline-none sm:px-8",
                vertical ? "script-vertical" : "script-horizontal",
              )}
            >
              {currentText === undefined ? (
                <p className="text-sm text-muted-foreground">
                  {t("script.loading")}
                </p>
              ) : currentText instanceof Error ? (
                <p className="text-sm text-destructive">{t("script.failed")}</p>
              ) : currentText.trim() === "" ? (
                <p className="text-sm text-muted-foreground">
                  {t("script.empty")}
                </p>
              ) : (
                <div
                  className="script-body"
                  style={{ fontSize: `${size}px` }}
                >
                  {currentText}
                </div>
              )}
            </div>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </ReaderContext.Provider>
  );
}
