"use client";

import { AudioLines, Gauge, History, Play, RotateCcw, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import {
  usePlayerPrefs,
  type ResumeMode,
  type WavPlayback,
} from "@/components/player/player-prefs";

/**
 * How playback behaves on this device. Like the appearance settings, these are
 * stored in localStorage rather than the settings table — listening positions
 * are shared, but whether this browser honours them (and whether it wants the
 * full-fat audio) is a per-device choice.
 */

interface Choice<T extends string> {
  value: T;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  icon: React.ReactNode;
}

const RESUME_OPTIONS: Choice<ResumeMode>[] = [
  {
    value: "resume",
    labelKey: "settings.playback.resumeSaved",
    hintKey: "settings.playback.resumeSavedHint",
    icon: <History className="h-4 w-4" />,
  },
  {
    value: "restart",
    labelKey: "settings.playback.restart",
    hintKey: "settings.playback.restartHint",
    icon: <RotateCcw className="h-4 w-4" />,
  },
];

const WAV_OPTIONS: Choice<WavPlayback>[] = [
  {
    value: "original",
    labelKey: "settings.playback.wavOriginal",
    hintKey: "settings.playback.wavOriginalHint",
    icon: <AudioLines className="h-4 w-4" />,
  },
  {
    value: "compressed",
    labelKey: "settings.playback.wavCompressed",
    hintKey: "settings.playback.wavCompressedHint",
    icon: <Gauge className="h-4 w-4" />,
  },
];

function ChoiceSetting<T extends string>({
  heading,
  hint,
  groupLabel,
  options,
  value,
  onChange,
}: {
  heading: TranslationKey;
  hint: TranslationKey;
  groupLabel: TranslationKey;
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useTranslations();

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Play className="h-4 w-4" /> {t(heading)}
      </h3>
      <p className="text-xs text-muted-foreground">{t(hint)}</p>
      <div
        role="radiogroup"
        aria-label={t(groupLabel)}
        className="grid gap-3 pt-1 sm:grid-cols-2"
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-accent/30" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {opt.icon}
                {t(opt.labelKey)}
                {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground">{t(opt.hintKey)}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PlaybackSettings() {
  const { t } = useTranslations();
  const { resumeMode, setResumeMode, wavPlayback, setWavPlayback } =
    usePlayerPrefs();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-4 w-4" /> {t("settings.playback.title")}
        </CardTitle>
        <CardDescription>{t("settings.playback.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChoiceSetting
          heading="settings.playback.resume"
          hint="settings.playback.resumeHint"
          groupLabel="settings.playback.resumeGroup"
          options={RESUME_OPTIONS}
          value={resumeMode}
          onChange={setResumeMode}
        />
        <ChoiceSetting
          heading="settings.playback.wav"
          hint="settings.playback.wavHint"
          groupLabel="settings.playback.wavGroup"
          options={WAV_OPTIONS}
          value={wavPlayback}
          onChange={setWavPlayback}
        />
      </CardContent>
    </Card>
  );
}
