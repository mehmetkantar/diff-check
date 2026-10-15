import { en, type Messages } from './en';
import { tr } from './tr';

export { en, tr };
export type { Messages };

export const locales: Record<string, Messages> = { en, tr };

/** Picks a bundled locale from a BCP 47 tag ("tr-TR" -> tr), falling back to English. */
export function resolveLocale(tag?: string | null): Messages {
  const base = (tag ?? '').toLowerCase().split('-')[0];
  return locales[base] ?? en;
}
