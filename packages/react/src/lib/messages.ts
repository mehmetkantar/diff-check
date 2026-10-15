import { resolveLocale, type Messages } from '@redline/core';
import { useMemo } from 'react';

export type LocaleProp = 'en' | 'tr' | Messages | undefined;

/** Resolves the `locale` prop: a bundled language code, a custom Messages object, or the browser language. */
export function useMessages(locale: LocaleProp): Messages {
  return useMemo(() => {
    if (locale && typeof locale === 'object') return locale;
    if (locale) return resolveLocale(locale);
    return resolveLocale(typeof navigator !== 'undefined' ? navigator.language : 'en');
  }, [locale]);
}
