"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search, Mic2, Users, Tag as TagIcon, Disc3, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Suggestion {
  type: "seiyuu" | "circle" | "tag" | "work";
  id: string;
  name: string;
  context?: string;
  workCount: number;
  score: number;
}

const TYPE_LABELS: Record<Suggestion["type"], string> = {
  seiyuu: "Seiyuu",
  circle: "Circles",
  tag: "Tags",
  work: "Works",
};

const TYPE_ORDER: Suggestion["type"][] = ["seiyuu", "circle", "tag", "work"];

function suggestionHref(s: Suggestion): string {
  switch (s.type) {
    case "seiyuu":
      return `/?va=${s.id}`;
    case "circle":
      return `/?circles=${s.id}`;
    case "tag":
      return `/?tags=${s.id}`;
    case "work":
      return `/works/${s.id}`;
  }
}

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
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep input synced with URL when user navigates by other means.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ(params.get("q") ?? "");
  }, [params]);

  // Debounced fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
  }, [q]);

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
    startTransition(() => router.push(suggestionHref(s)));
  }

  return (
    <div ref={wrapRef} className="relative ml-auto flex-1 max-w-md">
      <CommandPrimitive shouldFilter={false} loop label="Search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <CommandPrimitive.Input asChild value={q} onValueChange={setQ}>
            <Input
              ref={inputRef}
              suppressHydrationWarning
              placeholder="Search seiyuu, circles, tags, works…"
              className={cn("pl-9", (pending || loading) && "pr-8")}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
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
                  No matches. Press Enter to search anyway.
                </CommandPrimitive.Empty>
              )}
              {grouped.map(({ type, items: list }) => (
                <CommandPrimitive.Group
                  key={type}
                  heading={TYPE_LABELS[type]}
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
                  Enter to search titles for &quot;{q.trim()}&quot;
                </div>
              )}
            </CommandPrimitive.List>
          </div>
        )}
      </CommandPrimitive>
    </div>
  );
}
