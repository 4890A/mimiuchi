"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  AudioLines,
  Check,
  Minus,
  Monitor,
  Moon,
  Palette,
  Sun,
  SunMoon,
} from "lucide-react";
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
  type SeekbarStyle,
} from "@/components/player/player-prefs";
import { useHideCardTags } from "@/components/appearance-prefs";

/**
 * Per-device look-and-feel. Every control here writes to localStorage rather
 * than the settings table, so a phone and a desktop can disagree.
 */

const noopSubscribe = () => () => {};
const alwaysTrue = () => true;
const alwaysFalse = () => false;

/**
 * False on the server and through the first client render, true afterwards.
 * The stored theme only exists in localStorage, so next-themes reports
 * `undefined` until it has mounted; painting a selection before then would be
 * a hydration mismatch.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, alwaysTrue, alwaysFalse);
}

const THEME_OPTIONS: {
  value: string;
  labelKey: TranslationKey;
  icon: React.ReactNode;
}[] = [
  {
    value: "light",
    labelKey: "settings.appearance.themeLight",
    icon: <Sun className="h-4 w-4" />,
  },
  {
    value: "dark",
    labelKey: "settings.appearance.themeDark",
    icon: <Moon className="h-4 w-4" />,
  },
  {
    value: "system",
    labelKey: "settings.appearance.themeSystem",
    icon: <Monitor className="h-4 w-4" />,
  },
];

function ThemeSetting() {
  const { t } = useTranslations();
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <SunMoon className="h-4 w-4" /> {t("settings.appearance.theme")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("settings.appearance.themeHint")}
      </p>
      <div
        role="radiogroup"
        aria-label={t("settings.appearance.themeGroup")}
        className="grid gap-3 pt-1 sm:grid-cols-3"
      >
        {THEME_OPTIONS.map((opt) => {
          const selected = hydrated && theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(opt.value)}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
                "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-accent/30" : "border-border",
              )}
            >
              {opt.icon}
              {t(opt.labelKey)}
              {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

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
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  icon: React.ReactNode;
  preview: React.ReactNode;
}[] = [
  {
    value: "bar",
    labelKey: "settings.appearance.bar",
    hintKey: "settings.appearance.barHint",
    icon: <Minus className="h-4 w-4" />,
    preview: <BarPreview />,
  },
  {
    value: "waveform",
    labelKey: "settings.appearance.waveform",
    hintKey: "settings.appearance.waveformHint",
    icon: <AudioLines className="h-4 w-4" />,
    preview: <WaveformPreview />,
  },
];

function SeekbarSetting() {
  const { seekbarStyle, setSeekbarStyle } = usePlayerPrefs();
  const { t } = useTranslations();

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <AudioLines className="h-4 w-4" /> {t("settings.appearance.seekbar")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("settings.appearance.seekbarHint")}
      </p>
      <div
        role="radiogroup"
        aria-label={t("settings.appearance.seekbarGroup")}
        className="grid gap-3 pt-1 sm:grid-cols-2"
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
                {t(opt.labelKey)}
                {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
              {opt.preview}
              <p className="text-xs text-muted-foreground">{t(opt.hintKey)}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LibraryCardsSetting() {
  const { t } = useTranslations();
  const { hideCardTags, setHideCardTags } = useHideCardTags();

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {t("settings.appearance.libraryCards")}
      </h3>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={hideCardTags}
          onChange={(e) => setHideCardTags(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>
          {t("settings.appearance.hideTags")}
          <span className="block text-xs text-muted-foreground">
            {t("settings.appearance.hideTagsHint")}
          </span>
        </span>
      </label>
    </section>
  );
}

export function AppearanceSettings() {
  const { t } = useTranslations();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-4 w-4" /> {t("settings.appearance.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.appearance.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ThemeSetting />
        <SeekbarSetting />
        <LibraryCardsSetting />
      </CardContent>
    </Card>
  );
}
