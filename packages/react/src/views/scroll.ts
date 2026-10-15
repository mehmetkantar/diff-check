import type { Comparison } from '@redline/core';
import { useEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '../lib/theme';

export type Seg = 'only' | 'first' | 'mid' | 'last';

/** For runs of consecutive rows belonging to the active change: where each row sits in its run. */
export function activeSegments(rows: { key: string; changeId?: string }[], activeId: string | null): Map<string, Seg> {
  const out = new Map<string, Seg>();
  if (!activeId) return out;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].changeId !== activeId) continue;
    const prev = rows[i - 1]?.changeId === activeId;
    const next = rows[i + 1]?.changeId === activeId;
    out.set(rows[i].key, prev && next ? 'mid' : prev ? 'last' : next ? 'first' : 'only');
  }
  return out;
}

const rowSelector = (key: string) => `[data-row-key="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key}"]`;

/** Scrolls a row to the middle of its scroll container and flashes it briefly. */
export function revealRow(container: HTMLElement | null, key: string, flash = true): boolean {
  if (!container) return false;
  const el = container.querySelector<HTMLElement>(rowSelector(key));
  if (!el) return false;
  const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  const centered = el.offsetHeight > container.clientHeight * 0.7 ? top - 80 : top - container.clientHeight / 2 + el.offsetHeight / 2;
  container.scrollTo({ top: Math.max(0, centered), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  if (flash) {
    el.classList.remove('rl-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('rl-flash');
  }
  return true;
}

/**
 * Views call this once: it reveals the active change whenever the viewer bumps
 * `scrollSignal` (and on mount), and a specific row whenever `focusRow` changes.
 */
export function useRevealRows(
  container: RefObject<HTMLElement | null>,
  cmp: Comparison,
  activeId: string | null,
  scrollSignal: number,
  focusRow?: { key: string; signal: number } | null,
) {
  const latest = useRef({ cmp, activeId });
  latest.current = { cmp, activeId };

  useEffect(() => {
    const { cmp: c, activeId: id } = latest.current;
    if (!id) return;
    const change = c.changes.find((x) => x.id === id);
    if (!change) return;
    // Wait a frame so freshly mounted rows are laid out.
    const raf = requestAnimationFrame(() => {
      for (const key of change.rows) if (revealRow(container.current, key)) break;
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollSignal, container]);

  useEffect(() => {
    if (!focusRow) return;
    const raf = requestAnimationFrame(() => revealRow(container.current, focusRow.key));
    return () => cancelAnimationFrame(raf);
  }, [focusRow?.signal, focusRow?.key, container]);
}
