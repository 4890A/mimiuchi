"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { addTagToWork } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface TagSuggestion {
  type: "tag";
  id: string;
  name: string;
  workCount: number;
  score: number;
}

export function AddTagButton({
  workId,
  existingTagNames,
}: {
  workId: string;
  existingTagNames: string[];
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<TagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const existingSet = new Set(existingTagNames.map((n) => n.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
          `/api/search/suggest?type=tag&q=${encodeURIComponent(trimmed)}&limit=10`,
          { signal: ac.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { suggestions: TagSuggestion[] };
        setItems(data.suggestions.filter((s) => !existingSet.has(s.name.toLowerCase())));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[add-tag] suggest failed", err);
          setItems([]);
        }
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function submit(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existingSet.has(trimmed.toLowerCase())) {
      setOpen(false);
      setQ("");
      return;
    }
    startTransition(async () => {
      const result = await addTagToWork(workId, trimmed);
      if (!result.ok) {
        console.error("[add-tag]", result.error);
        return;
      }
      setOpen(false);
      setQ("");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("addTag.label")}
        className="inline-flex items-center gap-0.5 rounded-full bg-secondary/60 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    );
  }

  const trimmed = q.trim();
  const showCreate =
    trimmed.length > 0 &&
    !existingSet.has(trimmed.toLowerCase()) &&
    !items.some((s) => s.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div ref={wrapRef} className="relative">
      <CommandPrimitive shouldFilter={false} loop label={t("addTag.label")}>
        <div className="relative">
          <CommandPrimitive.Input asChild value={q} onValueChange={setQ}>
            <Input
              ref={inputRef}
              placeholder={t("edit.addTagPlaceholder")}
              className={cn("h-7 w-44 px-2 text-xs", (pending || loading) && "pr-7")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const sel = wrapRef.current?.querySelector<HTMLElement>(
                    "[data-selected='true'][cmdk-item]",
                  );
                  if (!sel) {
                    e.preventDefault();
                    submit(q);
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                  setQ("");
                }
              }}
            />
          </CommandPrimitive.Input>
          {(pending || loading) && (
            <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {trimmed && (
          <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[12rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
            <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1">
              {items.map((s) => (
                <CommandPrimitive.Item
                  key={s.id}
                  value={`tag:${s.id}:${s.name}`}
                  onSelect={() => submit(s.name)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-secondary"
                >
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {s.workCount}
                  </span>
                </CommandPrimitive.Item>
              ))}
              {showCreate && (
                <CommandPrimitive.Item
                  value={`__create__:${trimmed}`}
                  onSelect={() => submit(trimmed)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">
                    {t("addTag.create")}{" "}
                    <span className="font-medium">&quot;{trimmed}&quot;</span>
                  </span>
                </CommandPrimitive.Item>
              )}
              {!loading && !showCreate && items.length === 0 && (
                <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("common.noMatches")}
                </CommandPrimitive.Empty>
              )}
            </CommandPrimitive.List>
          </div>
        )}
      </CommandPrimitive>
    </div>
  );
}
