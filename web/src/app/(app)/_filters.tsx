"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowDown, ArrowUp, X } from "lucide-react";

interface FilterItem {
  id: number;
  name: string;
  nameEn?: string | null;
  workCount: number;
}

function toggleInQuery(
  params: URLSearchParams,
  key: string,
  id: number,
  selected: number[],
): URLSearchParams {
  const next = selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id];
  if (next.length) params.set(key, next.join(","));
  else params.delete(key);
  return params;
}

export function TagFilter({
  items,
  selected,
}: {
  items: FilterItem[];
  selected: number[];
}) {
  return (
    <FilterList items={items} selected={selected} paramKey="tags" />
  );
}

export function VoiceActorFilter({
  items,
  selected,
}: {
  items: FilterItem[];
  selected: number[];
}) {
  return (
    <FilterList items={items} selected={selected} paramKey="va" />
  );
}

export function CircleFilter({
  items,
  selected,
}: {
  items: FilterItem[];
  selected: number[];
}) {
  return (
    <FilterList items={items} selected={selected} paramKey="circles" />
  );
}

const PARAM_TO_SUGGEST_TYPE: Record<string, "tag" | "seiyuu" | "circle"> = {
  tags: "tag",
  va: "seiyuu",
  circles: "circle",
};

function FilterList({
  items,
  selected,
  paramKey,
}: {
  items: FilterItem[];
  selected: number[];
  paramKey: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [fuzzyIds, setFuzzyIds] = useState<number[] | null>(null);

  const itemsById = useMemo(() => {
    const m = new Map<number, FilterItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) {
      setFuzzyIds(null);
      return;
    }
    const type = PARAM_TO_SUGGEST_TYPE[paramKey];
    if (!type) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(trimmed)}&type=${type}&limit=200`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          suggestions: Array<{ id: string }>;
        };
        const ids = data.suggestions
          .map((s) => parseInt(s.id, 10))
          .filter(Number.isFinite);
        setFuzzyIds(ids);
      } catch {
        // aborted or network error — ignore
      }
    }, 120);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, paramKey]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items.slice(0, 200);
    if (fuzzyIds === null) {
      // Fall back to a quick substring match while suggestions load.
      const lc = q.trim().toLowerCase();
      return items
        .filter(
          (it) =>
            it.name.toLowerCase().includes(lc) ||
            it.nameEn?.toLowerCase().includes(lc),
        )
        .slice(0, 200);
    }
    const out: FilterItem[] = [];
    for (const id of fuzzyIds) {
      const it = itemsById.get(id);
      if (it) out.push(it);
    }
    return out;
  }, [items, itemsById, q, fuzzyIds]);

  return (
    <div>
      <Input
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-2"
      />
      <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {filtered.map((it) => {
          const active = selected.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params.toString());
                toggleInQuery(next, paramKey, it.id, selected);
                router.push(`/?${next.toString()}`);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                active
                  ? "bg-primary/15 text-foreground"
                  : "hover:bg-secondary",
              )}
            >
              <span className="truncate">{it.name}</span>
              <Badge
                variant={active ? "default" : "secondary"}
                className="shrink-0"
              >
                {it.workCount}
              </Badge>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No matches
          </p>
        )}
      </div>
    </div>
  );
}

interface NamedItem {
  id: number;
  name: string;
}

export function ActiveFilters({
  q,
  tags,
  voiceActors,
  circles,
}: {
  q?: string;
  tags: NamedItem[];
  voiceActors: NamedItem[];
  circles?: NamedItem[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const circleList = circles ?? [];
  if (
    !q &&
    tags.length === 0 &&
    voiceActors.length === 0 &&
    circleList.length === 0
  )
    return null;

  const push = (next: URLSearchParams) => {
    const s = next.toString();
    router.push(s ? `/?${s}` : "/");
  };

  const removeFromList = (key: "tags" | "va" | "circles", id: number) => {
    const next = new URLSearchParams(params.toString());
    const current =
      next
        .get(key)
        ?.split(",")
        .map((s) => parseInt(s, 10))
        .filter(Number.isFinite) ?? [];
    const after = current.filter((x) => x !== id);
    if (after.length) next.set(key, after.join(","));
    else next.delete(key);
    push(next);
  };

  const removeQuery = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("q");
    push(next);
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("q");
    next.delete("tags");
    next.delete("va");
    next.delete("circles");
    push(next);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {q && (
        <FilterChip label={`“${q}”`} onRemove={removeQuery} />
      )}
      {voiceActors.map((va) => (
        <FilterChip
          key={`va-${va.id}`}
          label={va.name}
          tone="va"
          onRemove={() => removeFromList("va", va.id)}
        />
      ))}
      {circleList.map((c) => (
        <FilterChip
          key={`circle-${c.id}`}
          label={c.name}
          tone="circle"
          onRemove={() => removeFromList("circles", c.id)}
        />
      ))}
      {tags.map((t) => (
        <FilterChip
          key={`tag-${t.id}`}
          label={t.name}
          tone="tag"
          onRemove={() => removeFromList("tags", t.id)}
        />
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
  tone,
}: {
  label: string;
  onRemove: () => void;
  tone?: "tag" | "va" | "circle";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        tone === "va" && "border-primary/30 bg-primary/10",
        tone === "circle" && "border-foreground/20 bg-muted",
        tone === "tag" && "border-border bg-secondary",
      )}
    >
      <span className="max-w-[16rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function SortPicker({
  current,
  dir,
}: {
  current: string;
  dir?: "asc" | "desc";
}) {
  const router = useRouter();
  const params = useSearchParams();
  const labels: Record<string, string> = {
    added: "Recently added",
    release: "Release date",
    title: "Title",
  };
  const defaultDir: "asc" | "desc" = current === "title" ? "asc" : "desc";
  const effectiveDir = dir ?? defaultDir;
  const reversed = effectiveDir !== defaultDir;

  const toggleDir = () => {
    const next = new URLSearchParams(params.toString());
    const flipped = effectiveDir === "asc" ? "desc" : "asc";
    if (flipped === defaultDir) next.delete("dir");
    else next.set("dir", flipped);
    router.push(`/?${next.toString()}`);
  };

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-1.5" />}
        >
          <ArrowUpDown className="h-4 w-4" />
          {labels[current] ?? "Sort"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {Object.entries(labels).map(([k, v]) => (
            <DropdownMenuItem
              key={k}
              onClick={() => {
                const next = new URLSearchParams(params.toString());
                next.set("sort", k);
                // Reset dir when changing sort so each sort uses its own default.
                next.delete("dir");
                router.push(`/?${next.toString()}`);
              }}
            >
              {v}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="sm"
        onClick={toggleDir}
        aria-label={reversed ? "Reverse: on" : "Reverse: off"}
        title={
          effectiveDir === "asc"
            ? current === "title"
              ? "A → Z"
              : "Oldest first"
            : current === "title"
              ? "Z → A"
              : "Newest first"
        }
        className={cn("px-2", reversed && "border-primary/50 text-primary")}
      >
        {effectiveDir === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
