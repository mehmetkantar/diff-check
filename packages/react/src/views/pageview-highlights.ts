import { sideSpans, type Comparison, type Op, type Side, type SpanKind } from '@redline/core';

export type MarkKind = Exclude<SpanKind, 'eq'>;

/** A highlight rectangle on a PDF page, in PDF units at scale 1 (top-left origin). */
export interface Highlight {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: MarkKind;
  changeId?: string;
  rowKey: string;
}

export interface PageHighlights {
  byPage: Map<number, Highlight[]>;
  /** First highlight of each change on this side, in reading order */
  firstByChange: Map<string, Highlight>;
  /** First word box of each row on this side (changed or not), for focus requests */
  firstByRow: Map<string, { page: number; y: number }>;
}

/** Index of the block an op shows on the given side, if any. */
export function blockOf(op: Op, side: Side): number | undefined {
  if (side === 'L') return op.t === 'ins' || op.t === 'movdst' ? undefined : op.l;
  return op.t === 'del' || op.t === 'movsrc' ? undefined : op.r;
}

/**
 * Maps the render model's changed spans onto the word boxes pdf.js gave us,
 * then merges neighbouring boxes on a line so a changed phrase is one mark.
 */
export function computeHighlights(cmp: Comparison, side: Side): PageHighlights {
  const doc = side === 'L' ? cmp.left : cmp.right;
  const changeOf = side === 'L' ? cmp.changeOfL : cmp.changeOfR;
  const byPage = new Map<number, Highlight[]>();
  const firstByChange = new Map<string, Highlight>();
  const firstByRow = new Map<string, { page: number; y: number }>();

  for (const row of cmp.rows) {
    const idx = blockOf(row.op, side);
    if (idx === undefined) continue;
    const block = doc.blocks[idx];
    if (!block?.boxes?.length) continue;
    const b0 = block.boxes[0];
    firstByRow.set(row.key, { page: b0.page, y: b0.y });

    const marks = sideSpans(cmp, row.op, side).filter((s) => s.k !== 'eq');
    if (!marks.length) continue;
    const changeId = changeOf.get(idx) ?? row.changeId;

    let prev: Highlight | null = null;
    for (const box of block.boxes) {
      const hit = marks.find((s) => s.start < box.end && s.end > box.start);
      if (!hit) {
        prev = null;
        continue;
      }
      const kind = hit.k as MarkKind;
      const sameLine =
        prev && prev.page === box.page && prev.kind === kind && Math.abs(prev.y - box.y) < box.h * 0.4 && box.x - (prev.x + prev.w) < box.h * 0.9;
      if (prev && sameLine) {
        const right = Math.max(prev.x + prev.w, box.x + box.w);
        const top = Math.min(prev.y, box.y);
        prev.h = Math.max(prev.y + prev.h, box.y + box.h) - top;
        prev.y = top;
        prev.w = right - prev.x;
        continue;
      }
      const hl: Highlight = { page: box.page, x: box.x, y: box.y, w: box.w, h: box.h, kind, changeId, rowKey: row.key };
      const list = byPage.get(box.page) ?? [];
      list.push(hl);
      byPage.set(box.page, list);
      if (changeId && !firstByChange.has(changeId)) firstByChange.set(changeId, hl);
      prev = hl;
    }
  }
  return { byPage, firstByChange, firstByRow };
}

// The page itself is always rendered on white, so marks use the light palette in both themes.
const INK: Record<MarkKind, string> = { ins: '#1d4ed8', del: '#b42318', mdst: '#0f6e3d', msrc: '#0f6e3d' };

const line = (c: string, pos: number, thickness: string) => `linear-gradient(${c},${c}) 0 ${pos.toFixed(1)}%/100% ${thickness} no-repeat`;

/**
 * Word boxes span [baseline - 0.82em, baseline + 0.2em]. Highlights are drawn
 * MARK_HEIGHT times taller so a double underline fits below the baseline, and
 * every line is placed in em-relative percentages so it stays clear of the
 * glyphs at any zoom level.
 */
export const MARK_HEIGHT = 1.2;
const EM = 1.02 * MARK_HEIGHT; // highlight height in em
const at = (emFromTop: number) => (emFromTop / EM) * 100;
const BASELINE = 0.82;

/**
 * Same redundant line styles as the text marks: inserted and moved-here get a
 * double underline, deleted a single strike, moved-away a double strike.
 */
export function markBackground(kind: MarkKind): string {
  const c = INK[kind];
  const fill = `${c}24`;
  switch (kind) {
    case 'ins':
    case 'mdst':
      return `${line(c, at(BASELINE + 0.12), '1px')}, ${line(c, at(BASELINE + 0.26), '1px')}, ${fill}`;
    case 'del':
      return `${line(c, at(BASELINE - 0.3), '1.5px')}, ${fill}`;
    case 'msrc':
      return `${line(c, at(BASELINE - 0.38), '1px')}, ${line(c, at(BASELINE - 0.22), '1px')}, ${fill}`;
  }
}
