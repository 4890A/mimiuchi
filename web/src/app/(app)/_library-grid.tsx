"use client";
import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "library:card-size";

const PRESETS = [
  { key: "xs", label: "XS", px: 140 },
  { key: "s", label: "S", px: 170 },
  { key: "m", label: "M", px: 210 },
  { key: "l", label: "L", px: 270 },
  { key: "xl", label: "XL", px: 340 },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"];
const DEFAULT: PresetKey = "m";

export function LibraryGridSize({ children }: { children: React.ReactNode }) {
  const [preset, setPreset] = useState<PresetKey>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && PRESETS.some((p) => p.key === raw)) {
        setPreset(raw as PresetKey);
      } else if (raw) {
        // Migrate old numeric value to nearest preset.
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) {
          const nearest = PRESETS.reduce((best, p) =>
            Math.abs(p.px - n) < Math.abs(best.px - n) ? p : best,
          );
          setPreset(nearest.key);
        }
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, preset);
    } catch {}
  }, [ready, preset]);

  const size = PRESETS.find((p) => p.key === preset)?.px ?? 210;

  return (
    <>
      <div className="mb-3 hidden items-center justify-end gap-2 sm:flex">
        <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
        <div
          role="radiogroup"
          aria-label="Card size"
          className="inline-flex overflow-hidden rounded-md border bg-background"
        >
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={preset === p.key}
              onClick={() => setPreset(p.key)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium transition-colors",
                "border-r last:border-r-0",
                preset === p.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="grid gap-3 sm:gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`,
        }}
      >
        {children}
      </div>
    </>
  );
}
