"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { History, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { coverSrc } from "@/lib/cover";
import { cn } from "@/lib/utils";
import { getRandomWorks } from "@/lib/actions";
import { useTranslations } from "@/lib/i18n/client";
import type { RecentWork } from "@/lib/db/queries";

export function OnDeck({
  works,
  initialRandom,
}: {
  works: RecentWork[];
  initialRandom: RecentWork[];
}) {
  const { t } = useTranslations();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [random, setRandom] = useState(initialRandom);
  const [showRandom, setShowRandom] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!el) return;
      const delta =
        Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      el.scrollLeft += delta;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onShuffle() {
    // Switching into random view, or re-rolling while already in it,
    // both fetch a fresh random set.
    startTransition(async () => {
      const next = await getRandomWorks(8);
      setRandom(next);
      setShowRandom(true);
    });
  }

  if (works.length === 0) return null;

  const items = showRandom ? random : works;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {showRandom ? t("onDeck.random") : t("onDeck.title")}
        </h2>
        <button
          type="button"
          onClick={onShuffle}
          disabled={isPending}
          aria-pressed={showRandom}
          title={showRandom ? t("onDeck.shuffleAgain") : t("onDeck.showRandom")}
          className={cn(
            "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
            showRandom && "text-foreground",
          )}
        >
          <Shuffle className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
          <span className="sr-only">{t("onDeck.shuffle")}</span>
        </button>
        {showRandom && (
          <button
            type="button"
            onClick={() => setShowRandom(false)}
            title={t("onDeck.back")}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" />
            <span className="sr-only">{t("onDeck.back")}</span>
          </button>
        )}
      </div>
      <div
        ref={scrollerRef}
        className="on-deck-scroller -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:-mx-6 sm:px-6"
      >
        {items.map((w) => (
          <Link
            key={w.id}
            href={`/works/${w.id}`}
            data-nsfw-cover={w.nsfw ? "true" : undefined}
            className="group relative block w-40 shrink-0 sm:w-48"
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverSrc({
                  id: w.id,
                  coverUrl: w.coverUrl,
                  hasLocalCover: w.hasLocalCover,
                })}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {w.nsfw && (
                <Badge
                  variant="destructive"
                  className="absolute right-1.5 top-1.5 text-[10px] backdrop-blur"
                >
                  R18
                </Badge>
              )}
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
              <p
                title={w.title}
                className="absolute inset-x-2 bottom-1.5 line-clamp-2 text-xs font-medium text-white drop-shadow"
              >
                {w.title}
              </p>
            </div>
            {w.circleName && (
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                {w.circleName}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
