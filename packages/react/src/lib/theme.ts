import { useEffect, useState } from 'react';

export type ThemeProp = 'light' | 'dark' | 'system';

const query = '(prefers-color-scheme: dark)';
const systemTheme = (): 'light' | 'dark' =>
  typeof window !== 'undefined' && window.matchMedia?.(query).matches ? 'dark' : 'light';

/** Resolves 'system' to the OS preference and follows it live. */
export function useResolvedTheme(theme: ThemeProp = 'system'): 'light' | 'dark' {
  const [system, setSystem] = useState(systemTheme);
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return theme === 'system' ? system : theme;
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
