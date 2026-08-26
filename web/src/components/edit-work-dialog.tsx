"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, X, Loader2, ImageUp, RefreshCw } from "lucide-react";
import {
  updateWorkDetails,
  uploadWorkCover,
  setWorkCoverUrl,
  refreshWorkMetadata,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CoverPlaceholder } from "@/components/cover-placeholder";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface Suggestion {
  type: string;
  id: string;
  name: string;
  workCount: number;
}

/** Chip list + autocomplete input backed by /api/search/suggest. */
function TokenField({
  values,
  onChange,
  suggestType,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  suggestType: "seiyuu" | "tag";
  placeholder: string;
}) {
  const { t } = useTranslations();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const existing = new Set(values.map((v) => v.toLowerCase()));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(
          `/api/search/suggest?type=${suggestType}&q=${encodeURIComponent(trimmed)}&limit=8`,
          { signal: ac.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setItems(data.suggestions.filter((s) => !existing.has(s.name.toLowerCase())));
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setItems([]);
      }
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, suggestType]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function add(name: string) {
    const t = name.trim();
    if (!t) return;
    if (!existing.has(t.toLowerCase())) onChange([...values, t]);
    setQ("");
    setItems([]);
    setOpen(false);
  }

  function remove(name: string) {
    onChange(values.filter((v) => v !== name));
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-transparent p-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              aria-label={t("edit.remove", { name: v })}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={q}
          placeholder={values.length === 0 ? placeholder : ""}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && items[active]) add(items[active].name);
              else add(q);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Backspace" && !q && values.length) {
              remove(values[values.length - 1]);
            }
          }}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && q.trim() && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <ul className="max-h-52 overflow-y-auto p-1">
            {items.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(s.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                    i === active && "bg-secondary",
                  )}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {s.workCount}
                  </span>
                </button>
              </li>
            ))}
            {!items.some((s) => s.name.toLowerCase() === q.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  onClick={() => add(q)}
                  onMouseEnter={() => setActive(items.length)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                    active === items.length && "bg-secondary",
                  )}
                >
                  {t("edit.addValue")}{" "}
                  <span className="font-medium">&quot;{q.trim()}&quot;</span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export interface EditWorkInitial {
  title: string;
  circleName: string | null;
  releaseDate: string | null;
  workType: string | null;
  language: string | null;
  description: string | null;
  nsfw: boolean;
  voiceActors: string[];
  tags: string[];
  coverUrl: string | null;
}

export function EditWorkDialog({
  workId,
  initial,
  coverSrc,
  hasCover = true,
  canRefresh = true,
}: {
  workId: string;
  initial: EditWorkInitial;
  coverSrc: string;
  /** False when `coverSrc` would 404 — show the placeholder tile instead. */
  hasCover?: boolean;
  /** False for a work added by hand: there is no listing to refresh from. */
  canRefresh?: boolean;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [title, setTitle] = useState(initial.title);
  const [circleName, setCircleName] = useState(initial.circleName ?? "");
  const [releaseDate, setReleaseDate] = useState(initial.releaseDate ?? "");
  const [workType, setWorkType] = useState(initial.workType ?? "");
  const [language, setLanguage] = useState(initial.language ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [nsfw, setNsfw] = useState(initial.nsfw);
  const [voiceActors, setVoiceActors] = useState<string[]>(initial.voiceActors);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Reset the form to the current work whenever the dialog is (re)opened.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTitle(initial.title);
    setCircleName(initial.circleName ?? "");
    setReleaseDate(initial.releaseDate ?? "");
    setWorkType(initial.workType ?? "");
    setLanguage(initial.language ?? "");
    setDescription(initial.description ?? "");
    setNsfw(initial.nsfw);
    setVoiceActors(initial.voiceActors);
    setTags(initial.tags);
    setCoverFile(null);
    setCoverPreview(null);
    setCoverUrl("");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  /** Re-fetch this work from DLsite and drop the result into the form. The
   *  action has already persisted it, so closing without saving keeps it. */
  function refreshFromDlsite() {
    setRefreshing(true);
    startTransition(async () => {
      const res = await refreshWorkMetadata(workId);
      setRefreshing(false);
      if (!res.ok) {
        toast.error(t("edit.refreshFailed", { error: res.error }));
        return;
      }
      const w = res.work;
      setTitle(w.title);
      setCircleName(w.circleName ?? "");
      setReleaseDate(w.releaseDate ?? "");
      setWorkType(w.workType ?? "");
      setLanguage(w.language ?? "");
      setDescription(w.description ?? "");
      setNsfw(w.nsfw);
      setVoiceActors(w.voiceActors);
      setTags(w.tags);
      setCoverFile(null);
      setCoverUrl("");
      toast.success(t("edit.refreshed"));
      router.refresh();
    });
  }

  function save() {
    if (!title.trim()) {
      toast.error(t("edit.titleRequired"));
      return;
    }
    startTransition(async () => {
      const meta = await updateWorkDetails(workId, {
        title,
        circleName,
        releaseDate,
        workType,
        language,
        description,
        nsfw,
        voiceActors,
        tags,
      });
      if (!meta.ok) {
        toast.error(t("edit.saveFailed", { error: meta.error }));
        return;
      }

      if (coverFile) {
        const fd = new FormData();
        fd.append("cover", coverFile);
        const c = await uploadWorkCover(workId, fd);
        if (!c.ok) {
          toast.error(t("edit.coverFailed", { error: c.error }));
          setOpen(false);
          router.refresh();
          return;
        }
      } else if (coverUrl.trim() && coverUrl.trim() !== (initial.coverUrl ?? "")) {
        const c = await setWorkCoverUrl(workId, coverUrl);
        if (!c.ok) {
          toast.error(t("edit.coverUrlFailed", { error: c.error }));
          setOpen(false);
          router.refresh();
          return;
        }
      }

      toast.success(t("edit.updated"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        {t("edit.trigger")}
        <Pencil className="h-3 w-3" />
      </DialogTrigger>
      <DialogContent className="scrollbar-hide max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="p-4 pb-2">
          <div className="mr-7 flex items-center justify-between gap-3">
            <DialogTitle>{t("edit.title")}</DialogTitle>
            {canRefresh && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={refreshFromDlsite}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {refreshing ? t("edit.refreshing") : t("edit.refreshFromDlsite")}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          {/* Cover */}
          <div className="flex gap-3">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {/* A pending upload or a typed-in URL is a cover even when the
                  work has none saved yet, so either one wins over the tile. */}
              {coverPreview ?? (coverUrl.trim() || hasCover) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={coverPreview ?? (coverUrl.trim() || coverSrc)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <CoverPlaceholder />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileRef.current?.click()}
              >
                <ImageUp className="h-4 w-4" />
                {coverFile ? t("edit.changeFile") : t("edit.uploadImage")}
              </Button>
              {coverFile ? (
                <p className="truncate text-xs text-muted-foreground">{coverFile.name}</p>
              ) : (
                <Input
                  placeholder={t("edit.coverUrlPlaceholder")}
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  className="h-8 text-xs"
                />
              )}
            </div>
          </div>

          <Field label={t("edit.field.title")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("edit.field.circle")}>
              <Input value={circleName} onChange={(e) => setCircleName(e.target.value)} />
            </Field>
            <Field label={t("edit.field.releaseDate")}>
              <Input
                placeholder="YYYY-MM-DD"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
              />
            </Field>
            <Field label={t("edit.field.workType")}>
              <Input value={workType} onChange={(e) => setWorkType(e.target.value)} />
            </Field>
            <Field label={t("edit.field.language")}>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
            </Field>
          </div>

          <Field label={t("edit.field.voiceActors")}>
            <TokenField
              values={voiceActors}
              onChange={setVoiceActors}
              suggestType="seiyuu"
              placeholder={t("edit.addVoiceActor")}
            />
          </Field>

          <Field label={t("edit.field.tags")}>
            <TokenField
              values={tags}
              onChange={setTags}
              suggestType="tag"
              placeholder={t("edit.addTagPlaceholder")}
            />
          </Field>

          <Field label={t("edit.field.description")}>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={nsfw}
              onChange={(e) => setNsfw(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            {t("edit.nsfw")}
          </label>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button disabled={pending} onClick={save}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? t("edit.saving") : t("edit.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
