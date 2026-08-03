"use client";

import { AudioLines, Check, Minus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  usePlayerPrefs,
  type SeekbarStyle,
} from "@/components/player/player-prefs";

/** Fixed silhouette for the waveform preview — no randomness, no hydration drift. */
const PREVIEW_BARS = [
  0.2, 0.35, 0.5, 0.35, 0.65, 0.9, 0.7, 0.45, 0.3, 0.55, 0.8, 1, 0.75, 0.4,
  0.25, 0.45, 0.6, 0.4, 0.7, 0.85, 0.55, 0.3, 0.2, 0.4, 0.6, 0.5, 0.35, 0.25,
];
const PREVIEW_PLAYED = 0.45;

function WaveformPreview() {
  return (
    <div className="flex h-8 w-full items-center gap-[2px]">
      {PREVIEW_BARS.map((h, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-full",
            i / PREVIEW_BARS.length < PREVIEW_PLAYED
              ? "bg-primary"
              : "bg-foreground/25",
          )}
          style={{ height: `${Math.max(8, h * 100)}%` }}
        />
      ))}
    </div>
  );
}

function BarPreview() {
  return (
    <div className="flex h-8 w-full items-center">
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-foreground/25">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${PREVIEW_PLAYED * 100}%` }}
        />
      </div>
    </div>
  );
}

const OPTIONS: {
  value: SeekbarStyle;
  label: string;
  hint: string;
  icon: React.ReactNode;
  preview: React.ReactNode;
}[] = [
  {
    value: "bar",
    label: "Classic bar",
    hint: "A thin progress line along the top edge of the player.",
    icon: <Minus className="h-4 w-4" />,
    preview: <BarPreview />,
  },
  {
    value: "waveform",
    label: "Waveform",
    hint: "Shows the track's loudness so you can see pauses and peaks before you scrub.",
    icon: <AudioLines className="h-4 w-4" />,
    preview: <WaveformPreview />,
  },
];

export function PlayerSettings() {
  const { seekbarStyle, setSeekbarStyle } = usePlayerPrefs();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AudioLines className="h-4 w-4" /> Player seek bar
        </CardTitle>
        <CardDescription>
          Applies to this device only. Waveforms are generated once per track
          with ffmpeg and then cached, so the first play of a long file may show
          a plain bar for a few seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Seek bar style"
          className="grid gap-3 sm:grid-cols-2"
        >
          {OPTIONS.map((opt) => {
            const selected = seekbarStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSeekbarStyle(opt.value)}
                className={cn(
                  "group flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors",
                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary bg-accent/30" : "border-border",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {opt.icon}
                  {opt.label}
                  {selected && (
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  )}
                </div>
                {opt.preview}
                <p className="text-xs text-muted-foreground">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
