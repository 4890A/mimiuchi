"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  ScrollText,
  XIcon,
} from "lucide-react";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { useScriptReader } from "@/components/script-reader";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface WorkAssetView {
  id: number;
  kind: string;
  title: string;
  relativePath: string;
  extension: string;
  sizeBytes: number | null;
}

function folderOf(rel: string): string {
  const norm = rel.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(0, i) : "";
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n < 10 && u > 0 ? n.toFixed(1) : Math.round(n)} ${units[u]}`;
}

/**
 * A collapsed group. Matches the `<details>` pattern TrackList already uses,
 * but keeps its contents unmounted until the first time it is opened.
 *
 * `loading="lazy"` alone would not guarantee that. Lazy loading is keyed on
 * proximity to the viewport, not on whether the `<details>` is open, so a
 * group sitting in view when the page loads is free to start fetching its
 * images before anyone asks for them. Not mounting them is the part that
 * actually holds. Once opened the contents stay mounted, so collapsing and
 * reopening costs no refetch.
 */
function Group({
  icon,
  label,
  count,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  if (count === 0) return null;
  return (
    <details
      className="group/extras border-t first:border-t-0"
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm select-none hover:bg-accent/30 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/extras:rotate-90" />
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </summary>
      {opened && children}
    </details>
  );
}

function FileRow({
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-3 py-2 pl-10 text-left text-sm transition-colors hover:bg-accent/40"
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * The extras panel: everything in the work's folder that isn't audio.
 *
 * Every group starts collapsed, and stays unmounted until opened, so a work
 * shipping 45 CG frames costs nothing until someone goes looking for them.
 * What the grid then loads is the downscaled copy from `?thumb=1`; the
 * lightbox is the only thing that ever pulls a full-resolution image.
 */
export function WorkExtras({
  assets,
  nsfw,
}: {
  assets: WorkAssetView[];
  nsfw: boolean;
}) {
  const { t } = useTranslations();
  const reader = useScriptReader();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [video, setVideo] = useState<WorkAssetView | null>(null);

  const scripts = assets.filter((a) => a.kind === "script");
  const videos = assets.filter((a) => a.kind === "video");
  const others = assets.filter((a) => a.kind === "text" || a.kind === "other");

  // Two works ship the same illustration in two folders, byte for byte. Drop
  // the repeat from the gallery — the row still exists in the database, this
  // just avoids showing the user the same picture twice.
  const images = useMemo(() => {
    const seen = new Set<string>();
    return assets.filter((a) => {
      if (a.kind !== "image") return false;
      const key = `${a.title}${a.extension}:${a.sizeBytes ?? "?"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [assets]);

  const imageFolders = useMemo(() => {
    const groups = new Map<string, WorkAssetView[]>();
    for (const img of images) {
      const f = folderOf(img.relativePath);
      const list = groups.get(f);
      if (list) list.push(img);
      else groups.set(f, [img]);
    }
    return [...groups.entries()];
  }, [images]);

  // What the lightbox steps through: every image in the work, in the order the
  // grid lays them out. Grouping by folder reorders anything that interleaves
  // two folders, so paging through `images` itself would jump around.
  const ordered = useMemo(
    () => imageFolders.flatMap(([, list]) => list),
    [imageFolders],
  );

  if (assets.length === 0) return null;

  const openScript = (a: WorkAssetView) => {
    // A PDF has nothing the in-app reader can render; hand it to the browser.
    if (a.extension.toLowerCase() !== ".txt" || !reader?.has(a.id)) {
      window.open(`/api/asset/${a.id}`, "_blank", "noopener,noreferrer");
      return;
    }
    reader.openScript(a.id);
  };

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">
        {t("work.extras")}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {assets.length}
        </span>
      </h2>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Group
          icon={<ScrollText className="h-4 w-4" />}
          label={t("work.extrasScripts")}
          count={scripts.length}
        >
          <ul className="border-t">
            {scripts.map((a) => (
              <li key={a.id}>
                <FileRow onClick={() => openScript(a)}>
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground uppercase">
                    {a.extension.slice(1)}
                  </span>
                  {a.extension.toLowerCase() !== ".txt" && (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </FileRow>
              </li>
            ))}
          </ul>
        </Group>

        <Group
          icon={<ImageIcon className="h-4 w-4" />}
          label={t("work.extrasImages")}
          count={images.length}
        >
          <div className="space-y-3 border-t px-3 py-3 pl-10">
            {imageFolders.map(([folder, list]) => (
              <div key={folder}>
                {imageFolders.length > 1 && folder !== "" && (
                  <p className="mb-1.5 truncate text-xs text-muted-foreground">
                    {folder.replace(/\\/g, "/")}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {list.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      // Reuses the global R18 blur rule, which keys off this
                      // attribute and reveals on hover/focus.
                      data-nsfw-cover={nsfw ? "true" : undefined}
                      onClick={() =>
                        setLightbox(ordered.findIndex((i) => i.id === img.id))
                      }
                      title={img.title}
                      className="block cursor-zoom-in overflow-hidden rounded-md border bg-muted/30 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* The full image is 2000x3000 and several megabytes;
                          `?thumb=1` serves a 480px WebP instead. The lightbox
                          below still shows the original. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/asset/${img.id}?thumb=1`}
                        alt={img.title}
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Group>

        <Group
          icon={<Film className="h-4 w-4" />}
          label={t("work.extrasVideos")}
          count={videos.length}
        >
          <ul className="border-t">
            {videos.map((a) => (
              <li key={a.id}>
                <FileRow onClick={() => setVideo(a)}>
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatSize(a.sizeBytes)}
                  </span>
                </FileRow>
              </li>
            ))}
          </ul>
        </Group>

        <Group
          icon={<FileText className="h-4 w-4" />}
          label={t("work.extrasOther")}
          count={others.length}
        >
          <ul className="border-t">
            {others.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/asset/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3 px-3 py-2 pl-10 text-left text-sm transition-colors hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {a.title}
                    {a.extension}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatSize(a.sizeBytes)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </Group>
      </div>

      <ImageLightbox
        images={ordered}
        index={lightbox}
        onIndex={setLightbox}
        onClose={() => setLightbox(null)}
      />

      <Dialog open={video !== null} onOpenChange={(o) => !o && setVideo(null)}>
        <DialogPortal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/85 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none">
            <DialogPrimitive.Title className="sr-only">
              {video?.title ?? ""}
            </DialogPrimitive.Title>
            {video && (
              // `preload="none"` matters: these run to a gigabyte, and the
              // asset route serves ranges so seeking works without one.
              <video
                src={`/api/asset/${video.id}`}
                controls
                autoPlay
                preload="none"
                className="max-h-[85vh] max-w-full rounded-lg shadow-2xl"
              />
            )}
            <DialogPrimitive.Close
              aria-label={t("common.close")}
              className="absolute top-3 right-3 rounded-md bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <XIcon className="h-5 w-5" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </section>
  );
}

/**
 * Full-size viewer over every image in the work, not just the folder whose
 * thumbnail was clicked — `images` is already the flat de-duplicated list and
 * the grid hands over an index into it.
 *
 * Three ways through it: the arrow buttons, a wheel or trackpad scroll on
 * desktop, and a horizontal swipe on touch.
 */
function ImageLightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: WorkAssetView[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const current = index === null ? null : (images[index] ?? null);
  const open = index !== null;
  // The popup element is held in state, not a ref: the wheel listener has to be
  // attached the moment it mounts, and a ref would not re-run the effect.
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  // The wheel listener is attached once per opening and must not be rebuilt on
  // every step, or the cooldown below would be discarded exactly when it is
  // needed. So the current index reaches it through a ref, not a closure.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const step = useCallback(
    (delta: number) => {
      const i = indexRef.current;
      if (i === null || images.length < 2) return;
      onIndex((i + delta + images.length) % images.length);
    },
    [images.length, onIndex],
  );

  /**
   * Scroll, for desktop. A mouse notch arrives as a single event, but a
   * trackpad flick arrives as a stream with a long momentum tail, and one image
   * per event would fly through the whole gallery. So deltas accumulate to a
   * threshold, a step opens a short window that swallows the tail, and a pause
   * between events starts a fresh gesture.
   */
  useEffect(() => {
    const el = popupEl;
    if (!open || !el || images.length < 2) return;
    let acc = 0;
    let last = 0;
    let until = 0;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const now = e.timeStamp;
      if (now < until) return;
      if (now - last > 200) acc = 0;
      last = now;
      acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(acc) < 50) return;
      step(acc > 0 ? 1 : -1);
      acc = 0;
      until = now + 350;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, popupEl, images.length, step]);

  // Moving on should not stall on a cold fetch, so the two neighbours are
  // warmed once an image is up. These are the full-resolution originals, so
  // only the two adjacent to what is already open are ever pulled.
  useEffect(() => {
    if (index === null || images.length < 2) return;
    const ids = new Set([
      images[(index + 1) % images.length].id,
      images[(index - 1 + images.length) % images.length].id,
    ]);
    for (const id of ids) new Image().src = `/api/asset/${id}`;
  }, [index, images]);

  // Swipe, for touch. `drag` follows the finger so the image moves with it. The
  // axis locks on the first real movement, leaving a vertical drag or a pinch
  // to the browser.
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(
    null,
  );
  // A completed swipe still ends in a click, which the full-bleed Close overlay
  // below would read as "dismiss". This eats that one click.
  const swiped = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    swiped.current = false;
    if (e.touches.length !== 1 || images.length < 2) return;
    touch.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      axis: null,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = touch.current;
    if (!start) return;
    if (e.touches.length !== 1) {
      touch.current = null;
      setDrag(0);
      return;
    }
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (start.axis === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (start.axis === "x") setDrag(dx);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    setDrag(0);
    if (!start || start.axis !== "x") return;
    const dx = (e.changedTouches[0]?.clientX ?? start.x) - start.x;
    if (Math.abs(dx) < 60) return;
    swiped.current = true;
    step(dx < 0 ? 1 : -1);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/85 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          ref={setPopupEl}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onClickCapture={(e) => {
            if (!swiped.current) return;
            swiped.current = false;
            e.stopPropagation();
            e.preventDefault();
          }}
          // `touch-pan-y` claims horizontal gestures for the swipe and leaves
          // vertical panning and pinch-zoom to the browser.
          className="fixed inset-0 z-50 flex touch-pan-y items-center justify-center p-4 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          {/* Fills the viewport so the backdrop stays clickable through the
              padding; the image below is pointer-events-none so it does not
              swallow that click. */}
          <DialogPrimitive.Close
            aria-label={t("common.close")}
            className="absolute inset-0 cursor-zoom-out"
          />
          <DialogPrimitive.Title className="sr-only">
            {current?.title ?? ""}
          </DialogPrimitive.Title>

          {current && (
            <div
              className="pointer-events-none relative transition-transform duration-200"
              // No transition while the finger is down, so the image tracks it
              // exactly; letting go animates the offset back to zero.
              style={{
                transform: drag ? `translateX(${drag}px)` : undefined,
                transition: drag ? "none" : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/asset/${current.id}`}
                alt={current.title}
                className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t("work.previousImage")}
                className="absolute left-3 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={t("work.nextImage")}
                className="absolute right-3 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <p
                className={cn(
                  "pointer-events-none absolute bottom-4 rounded-full bg-black/50 px-3 py-1",
                  "text-xs tabular-nums text-white",
                )}
              >
                {(index ?? 0) + 1} / {images.length}
              </p>
            </>
          )}

          <DialogPrimitive.Close
            aria-label={t("common.close")}
            className="absolute top-3 right-3 rounded-md bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <XIcon className="h-5 w-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
