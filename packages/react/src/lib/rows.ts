import type { Block, Change, Comparison, Op } from '@redline/core';

/** Blocks shown by a row, old side first. */
export function rowBlocks(cmp: Comparison, op: Op): { l?: Block; r?: Block } {
  const L = cmp.left.blocks;
  const R = cmp.right.blocks;
  switch (op.t) {
    case 'eq':
    case 'mod':
      return { l: L[op.l], r: R[op.r] };
    case 'del':
    case 'movsrc':
      return { l: L[op.l] };
    case 'ins':
    case 'movdst':
      return { r: R[op.r] };
  }
}

/** Bilingual filter: a row is shown when one of its blocks is in the chosen language or has none. */
export function rowVisible(cmp: Comparison, op: Op, lang: string | null): boolean {
  if (!lang) return true;
  const { l, r } = rowBlocks(cmp, op);
  return [l, r].some((b) => b && (!b.lang || b.lang === lang));
}

export function changeVisible(c: Change, lang: string | null): boolean {
  return !lang || !c.lang || c.lang === lang;
}

/** Row key showing a given block (used by clause-map navigation). */
export function rowKeyOfBlock(cmp: Comparison, side: 'L' | 'R', block: number): string | null {
  for (const row of cmp.rows) {
    const op = row.op;
    if (side === 'L' && 'l' in op && op.l === block && op.t !== 'movdst') return row.key;
    if (side === 'R' && 'r' in op && op.r === block && op.t !== 'movsrc') return row.key;
  }
  return null;
}

export const typeTone: Record<Change['type'], { text: string; border: string; bar: string }> = {
  mod: { text: 'rl:text-mod', border: 'rl:border-mod', bar: 'bar-mod' },
  ins: { text: 'rl:text-ins', border: 'rl:border-ins', bar: 'bar-ins' },
  del: { text: 'rl:text-del', border: 'rl:border-del', bar: 'bar-del' },
  move: { text: 'rl:text-mov', border: 'rl:border-mov', bar: 'bar-move' },
  renum: { text: 'rl:text-ink-3', border: 'rl:border-line-strong', bar: 'bar-renum' },
};

/** CSS colour variable per change type, for SVG and canvas drawing. */
export const typeColor: Record<Change['type'], string> = {
  mod: 'var(--rl-mod)',
  ins: 'var(--rl-ins)',
  del: 'var(--rl-del)',
  move: 'var(--rl-mov)',
  renum: 'var(--rl-ink-3)',
};
