"use client";
import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { makeT, type TFunction } from "./translate";

/**
 * The locale is resolved on the server (from the cookie) and handed down, so a
 * client component never renders the wrong language on first paint.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext value={locale}>{children}</LocaleContext>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useTranslations(): { locale: Locale; t: TFunction } {
  const locale = useLocale();
  const t = useMemo(() => makeT(locale), [locale]);
  return { locale, t };
}
