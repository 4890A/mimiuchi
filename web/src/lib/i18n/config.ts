/**
 * Interface language.
 *
 * The choice lives in a cookie rather than localStorage because most of the UI
 * is rendered on the server — a client-only store would make every server page
 * render in English first and flip on hydration.
 */

export const LOCALES = ["en", "ja"] as const;

export type Locale = (typeof LOCALES)[number];

/** Used until the visitor picks a language; an existing cookie always wins. */
export const DEFAULT_LOCALE: Locale = "ja";

export const LOCALE_COOKIE = "kikoeru.locale";

/** One year — the setting is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language names itself, so the switcher is readable in either mode. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}
