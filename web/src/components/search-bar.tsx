"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search, Mic2, Users, Tag as TagIcon, Disc3, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

interface Suggestion {
  type: "seiyuu" | "circle" | "tag" | "work";
  id: string;
  name: string;
  context?: string;
  workCount: number;
  score: number;
}

const TYPE_LABEL_KEYS: Record<Suggestion["type"], TranslationKey> = {
  seiyuu: "search.group.seiyuu",
  circle: "search.group.circle",
  tag: "search.group.tag",
  work: "search.group.work",
};

const TYPE_ORDER: Suggestion["type"][] = ["seiyuu", "circle", "tag", "work"];

const PARAM_BY_TYPE: Record<"seiyuu" | "circle" | "tag", string> = {
  seiyuu: "va",
  circle: "circles",
  tag: "tags",
};

function TypeIcon({ type }: { type: Suggestion["type"] }) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "seiyuu":
      return <Mic2 className={cls} />;
    case "circle":
      return <Users className={cls} />;
    case "tag":
      return <TagIcon className={cls} />;
    case "work":
      return <Disc3 className={cls} />;
  }
}

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const { t } = useTranslations();
  const [q, setQ] = useState(params.get("q") ?? "");
  const urlSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An IME (Japanese, Chinese, Korean) keeps a composition buffer inside the
  // input that React knows nothing about. Writing `value` while that buffer is
  // open desyncs the two: the browser re-commits the composition on top of the
  // value we just wrote, which shows up as duplicated kana and leftover romaji.
  // Tracked twice on purpose: the state re-runs the debounced effects once the
  // composition commits, while the URL→input effect reads the ref instead, so
  // that it is not itself re-triggered on commit with a stale `params`.
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);

  // Keep input synced with URL when user navigates by other means. Never while
  // the box has focus: on the library page we push `q` into the URL ourselves
  // (below), and that write comes back here one render later carrying whatever
  // was typed 180ms ago. Applying it would rewind the caret — and mid-IME,
  // corrupt the composition. While focused the input is the source of truth.
  useEffect(() => {
    if (composingRef.current) return;
    if (document.activeElement === inputRef.current) return;
    setQ(params.get("q") ?? "");
  }, [params]);

  // Debounced fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Half-finished romaji ("konnichiha" on the way to こんにちは) matches
    // nothing and just burns requests. Wait for the commit.
    if (composing) return;
    const trimmed = q.trim();
    if (!trimmed) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setItems([]);
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(trimmed)}&limit=15`,
          { signal: ac.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setItems(data.suggestions);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[search] suggest failed", err);
          setItems([]);
        }
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, composing]);

  // While on the library page, mirror q into the URL (debounced) so the grid
  // filters live as the user types. Skip elsewhere — typing in search on a
  // detail page must not navigate the user away.
  useEffect(() => {
    if (pathname !== "/") return;
    if (urlSyncRef.current) clearTimeout(urlSyncRef.current);
    if (composing) return;
    const trimmed = q.trim();
    const current = params.get("q") ?? "";
    if (trimmed === current) return;
    urlSyncRef.current = setTimeout(() => {
      const usp = new URLSearchParams(params.toString());
      if (trimmed) usp.set("q", trimmed);
      else usp.delete("q");
      const qs = usp.toString();
      startTransition(() =>
        router.replace(qs ? `/?${qs}` : "/", { scroll: false }),
      );
    }, 180);
    return () => {
      if (urlSyncRef.current) clearTimeout(urlSyncRef.current);
    };
  }, [q, composing, pathname, params, router]);

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<Suggestion["type"], Suggestion[]>();
    for (const it of items) {
      const arr = groups.get(it.type) ?? [];
      arr.push(it);
      groups.set(it.type, arr);
    }
    return TYPE_ORDER.filter((t) => groups.has(t)).map((t) => ({
      type: t,
      items: groups.get(t)!,
    }));
  }, [items]);

  function submitFreeText() {
    const usp = new URLSearchParams(params.toString());
    const t = q.trim();
    if (t) usp.set("q", t);
    else usp.delete("q");
    setOpen(false);
    startTransition(() => router.push(`/?${usp.toString()}`));
  }

  function selectSuggestion(s: Suggestion) {
    setOpen(false);
    setQ("");
    // Works navigate to their own page; everything else is a filter, so keep
    // the current filters and merge the suggestion into its own list instead
    // of replacing the whole query (mirrors the dedicated filter menu).
    if (s.type === "work") {
      startTransition(() => router.push(`/works/${s.id}`));
      return;
    }
    const usp = new URLSearchParams(params.toString());
    usp.delete("q");
    const paramKey = PARAM_BY_TYPE[s.type];
    const id = Number(s.id);
    const current = (usp.get(paramKey)?.split(",") ?? [])
      .map(Number)
      .filter(Number.isFinite);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    if (next.length) usp.set(paramKey, next.join(","));
    else usp.delete(paramKey);
    const qs = usp.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/"));
  }

  return (
    <div ref={wrapRef} className="relative ml-auto flex-1 max-w-md">
      <CommandPrimitive shouldFilter={false} loop label={t("common.search")}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <CommandPrimitive.Input asChild value={q} onValueChange={setQ}>
            <Input
              ref={inputRef}
              suppressHydrationWarning
              placeholder={t("search.placeholder")}
              // pr-8 is reserved even with no spinner: toggling it mid-typing
              // resizes the content box, and a value long enough to scroll
              // visibly lurches sideways when that happens.
              className="pl-9 pr-8"
              onFocus={() => setOpen(true)}
              onCompositionStart={() => {
                composingRef.current = true;
                setComposing(true);
              }}
              onCompositionEnd={(e) => {
                composingRef.current = false;
                setComposing(false);
                // Chrome fires the final `input` event before compositionend,
                // Safari after. Reading the element covers both, so the
                // committed text is never dropped.
                setQ(e.currentTarget.value);
              }}
              onKeyDown={(e) => {
                // Enter that closes an IME candidate window carries
                // keyCode 229 / isComposing; it must not submit the search.
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  // If cmdk has a highlighted item, it dispatches onSelect already.
                  // Fall back to free-text submit on Enter when nothing is selected.
                  const sel = wrapRef.current?.querySelector<HTMLElement>(
                    "[data-selected='true'][cmdk-item]",
                  );
                  if (!sel || items.length === 0) {
                    e.preventDefault();
                    submitFreeText();
                  }
                } else if (e.key === "Escape") {
                  setOpen(false);
                  inputRef.current?.blur();
                }
              }}
            />
          </CommandPrimitive.Input>
          {(pending || loading) && (
            <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {open && q.trim() && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
            <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-1">
              {!loading && items.length === 0 && (
                <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("search.empty")}
                </CommandPrimitive.Empty>
              )}
              {grouped.map(({ type, items: list }) => (
                <CommandPrimitive.Group
                  key={type}
                  heading={t(TYPE_LABEL_KEYS[type])}
                  className="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
                >
                  {list.map((s) => (
                    <CommandPrimitive.Item
                      key={`${s.type}:${s.id}`}
                      value={`${s.type}:${s.id}:${s.name}`}
                      onSelect={() => selectSuggestion(s)}
                      className="relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-secondary"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                        <TypeIcon type={s.type} />
                      </span>
                      <span className="truncate">{s.name}</span>
                      {s.context && (
                        <span className="ml-1 truncate text-xs text-muted-foreground">
                          {s.context}
                        </span>
                      )}
                      {s.type !== "work" && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {s.workCount}
                        </span>
                      )}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
              {q.trim() && (
                <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                  {t("search.enterHint", { query: q.trim() })}
                </div>
              )}
            </CommandPrimitive.List>
          </div>
        )}
      </CommandPrimitive>
    </div>
  );
}
