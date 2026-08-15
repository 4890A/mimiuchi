"use client";

import { History, Play, RotateCcw, Check } from "lucide-react";
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
import { usePlayerPrefs, type ResumeMode } from "@/components/player/player-prefs";

/**
 * How playback behaves on this device. Like the appearance settings, these are
 * stored in localStorage rather than the settings table — listening positions
 * are shared, but whether this browser honours them is a per-device choice.
 */

const RESUME_OPTIONS: {
  value: ResumeMode;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  icon: React.ReactNode;
}[] = [
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

function ResumeSetting() {
  const { t } = useTranslations();
  const { resumeMode, setResumeMode } = usePlayerPrefs();

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Play className="h-4 w-4" /> {t("settings.playback.resume")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("settings.playback.resumeHint")}
      </p>
      <div
        role="radiogroup"
        aria-label={t("settings.playback.resumeGroup")}
        className="grid gap-3 pt-1 sm:grid-cols-2"
      >
        {RESUME_OPTIONS.map((opt) => {
          const selected = resumeMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setResumeMode(opt.value)}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-4 w-4" /> {t("settings.playback.title")}
        </CardTitle>
        <CardDescription>{t("settings.playback.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResumeSetting />
      </CardContent>
    </Card>
  );
}
