"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/actions";

/**
 * Compact language switch for the pages that come before sign-in (login,
 * first-run setup). The default language is Japanese, and someone who reads
 * only English should not have to get through setup to find the toggle.
 * Takes the locale as a prop so it works outside `LocaleProvider`.
 */
export function LanguageToggle({ current }: { current: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex justify-center gap-1 text-xs">
      {LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          disabled={pending}
          aria-pressed={value === current}
          onClick={() => {
            if (value === current) return;
            startTransition(async () => {
              await setLocale(value);
              router.refresh();
            });
          }}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            value === current
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {LOCALE_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
