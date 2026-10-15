import { placeLabel } from './describe';
import type { Messages } from './locales/en';
import type { Block, Comparison, Op, Seg } from './types';

/**
 * A framework-free render model. Every view (React, HTML report, Word export)
 * turns a comparison into the same spans, so they always agree.
 */
export type SpanKind = 'eq' | 'ins' | 'del' | 'mdst' | 'msrc';

export interface Span {
  k: SpanKind;
  text: string;
  /** Offsets inside the block's text, for mapping to PDF word boxes */
  start: number;
  end: number;
}

export type Side = 'L' | 'R';

const whole = (b: Block, k: SpanKind): Span[] => [{ k, text: b.body, start: b.bodyStart, end: b.text.length }];

function fromSegs(segs: Seg[], b: Block, side: Side, base: SpanKind, edit: SpanKind): Span[] {
  const out: Span[] = [];
  for (const s of segs) {
    if (s.k === 'eq') {
      const [st, en] = side === 'L' ? [s.ls, s.le] : [s.rs, s.re];
      if (st === undefined || en === undefined) continue;
      out.push({ k: base, text: b.text.slice(st, en), start: st, end: en });
    } else if ((s.k === 'del' && side === 'L') || (s.k === 'ins' && side === 'R')) {
      const [st, en] = side === 'L' ? [s.ls!, s.le!] : [s.rs!, s.re!];
      out.push({ k: edit, text: s.text, start: st, end: en });
    }
  }
  return out;
}

/** Spans of one side of a row (side-by-side and page views). */
export function sideSpans(cmp: Comparison, op: Op, side: Side): Span[] {
  const L = cmp.left.blocks;
  const R = cmp.right.blocks;
  switch (op.t) {
    case 'eq':
      return whole(side === 'L' ? L[op.l] : R[op.r], 'eq');
    case 'del':
      return side === 'L' ? whole(L[op.l], 'del') : [];
    case 'ins':
      return side === 'R' ? whole(R[op.r], 'ins') : [];
    case 'mod': {
      const segs = cmp.inline.get(`${op.l}:${op.r}`) ?? [];
      return side === 'L' ? fromSegs(segs, L[op.l], 'L', 'eq', 'del') : fromSegs(segs, R[op.r], 'R', 'eq', 'ins');
    }
    case 'movsrc':
    case 'movdst': {
      if ((op.t === 'movsrc') !== (side === 'L')) return [];
      const segs = cmp.inline.get(`${op.l}:${op.r}`);
      if (!segs) return side === 'L' ? whole(L[op.l], 'msrc') : whole(R[op.r], 'mdst');
      return side === 'L' ? fromSegs(segs, L[op.l], 'L', 'msrc', 'del') : fromSegs(segs, R[op.r], 'R', 'mdst', 'ins');
    }
  }
}

/** Spans of the single-column redline: deletions and insertions interleaved. */
export function redlineSpans(cmp: Comparison, op: Op): Span[] {
  const L = cmp.left.blocks;
  const R = cmp.right.blocks;
  switch (op.t) {
    case 'eq':
      return whole(R[op.r], 'eq');
    case 'del':
      return whole(L[op.l], 'del');
    case 'ins':
      return whole(R[op.r], 'ins');
    case 'movsrc':
      return whole(L[op.l], 'msrc');
    case 'mod':
    case 'movdst': {
      const segs = cmp.inline.get(`${op.l}:${op.r}`);
      const base: SpanKind = op.t === 'mod' ? 'eq' : 'mdst';
      if (!segs) return whole(R[op.r], base);
      const b = R[op.r];
      return segs.map((s) =>
        s.k === 'eq'
          ? { k: base, text: s.text, start: s.rs ?? 0, end: s.re ?? 0 }
          : { k: s.k, text: s.text, start: (s.k === 'ins' ? s.rs : s.ls) ?? b.bodyStart, end: (s.k === 'ins' ? s.re : s.le) ?? b.bodyStart },
      );
    }
  }
}

/** The block a redline row shows, and which document it comes from. */
export function redlineBlock(cmp: Comparison, op: Op): { block: Block; side: Side } {
  if (op.t === 'del' || op.t === 'movsrc') return { block: cmp.left.blocks[op.l], side: 'L' };
  return { block: cmp.right.blocks[op.r], side: 'R' };
}

/** "Moved to Clause 9" / "Moved from Clause 7" notes for moved rows. */
export function moveNote(cmp: Comparison, op: Op, m: Messages): string | null {
  if (op.t === 'movsrc') return m.doc.movedTo(placeLabel(cmp.locR[op.r], m));
  if (op.t === 'movdst') return m.doc.movedFrom(placeLabel(cmp.locL[op.l], m));
  return null;
}
