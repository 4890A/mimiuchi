"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/actions";
import { useTranslations } from "@/lib/i18n/client";

export function LanguageSettings() {
  const { locale, t } = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      // Server components hold the rendered strings, so the tree has to be
      // re-fetched for the new cookie to take effect.
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-4 w-4" /> {t("settings.language.title")}
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </CardTitle>
        <CardDescription>{t("settings.language.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label={t("settings.language.group")}
          className="grid gap-3 sm:grid-cols-2"
        >
          {LOCALES.map((value) => {
            const selected = locale === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending}
                onClick={() => choose(value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:opacity-60",
                  selected ? "border-primary bg-accent/30" : "border-border",
                )}
              >
                {LOCALE_LABELS[value]}
                {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
