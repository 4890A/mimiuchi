import { DEFAULT_LOCALE, type Locale } from "./config";
import { en, ja, type TranslationKey } from "./dictionaries";

export type TranslationVars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  en,
  ja,
};

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Builds the `t` used everywhere in the UI.
 *
 * Kept as a factory rather than a hook so server components, client components
 * and plain helpers all translate through exactly the same code path.
 */
export function makeT(locale: Locale) {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];

  return function t(key: TranslationKey, vars?: TranslationVars): string {
    let template = dict[key];
    if (vars?.count === 1) {
      const singular = `${key}_one` as TranslationKey;
      if (singular in dict) template = dict[singular];
    }
    // Falling back to the key makes a missing string obvious rather than blank.
    return interpolate(template ?? key, vars);
  };
}

export type TFunction = ReturnType<typeof makeT>;
