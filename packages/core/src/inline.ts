import { diffArrays } from 'diff';
import { canon, tokenKey, tokenize, type Token } from './text';
import type { Block, CompareOptions, Edit, Seg } from './types';

interface Piece {
  k: 'eq' | 'chg';
  l: Token[];
  r: Token[];
}

const SHORT_GLUE = /^(ve|ile|veya|bir|de|da|ki|ya|of|and|or|the|a|an|to)$/i;

/**
 * Word-level diff between two paragraph bodies. Returns segments with offsets
 * into each block's full text (clause numbers excluded from the comparison).
 */
export function inlineDiff(a: Block, b: Block, opts: CompareOptions): Seg[] {
  const ta = tokenize(a.body, a.bodyStart);
  const tb = tokenize(b.body, b.bodyStart);
  const ka = ta.map((t) => tokenKey(t, opts));
  const kb = tb.map((t) => tokenKey(t, opts));

  let pieces: Piece[] = [];
  let i = 0;
  let j = 0;
  const push = (k: Piece['k'], l: Token[], r: Token[]) => {
    const last = pieces[pieces.length - 1];
    if (last && last.k === k) {
      last.l.push(...l);
      last.r.push(...r);
    } else pieces.push({ k, l: [...l], r: [...r] });
  };
  for (const part of diffArrays(ka, kb)) {
    const n = part.value.length;
    if (part.removed) {
      push('chg', ta.slice(i, i + n), []);
      i += n;
    } else if (part.added) {
      push('chg', [], tb.slice(j, j + n));
      j += n;
    } else {
      push('eq', ta.slice(i, i + n), tb.slice(j, j + n));
      i += n;
      j += n;
    }
  }

  // Absorb small equal islands between two changes so a lawyer reads one phrase
  // replaced ("reasonable care" -> "the care of a prudent merchant") instead of a
  // stutter of fragments. An island goes when it is a glue word or one short word
  // dwarfed by the changes around it.
  const chars = (ts: Token[]) => ts.reduce((n, t) => n + (t.k === 's' ? 0 : t.t.length), 0);
  for (let p = 1; p < pieces.length - 1; p++) {
    const cur = pieces[p];
    if (cur.k !== 'eq' || pieces[p - 1].k !== 'chg' || pieces[p + 1].k !== 'chg') continue;
    if (cur.l.some((t) => t.t === '│')) continue; // never merge across table cells
    const wordsIn = cur.l.filter((t) => t.k === 'w');
    const prev = pieces[p - 1];
    const next = pieces[p + 1];
    const around = Math.max(chars(prev.l) + chars(next.l), chars(prev.r) + chars(next.r));
    const glue =
      wordsIn.length === 0 ||
      (wordsIn.length === 1 && (SHORT_GLUE.test(wordsIn[0].t) || wordsIn[0].t.length <= 2 || around >= chars(cur.l) * 3));
    if (!glue) continue;
    prev.l.push(...cur.l, ...next.l);
    prev.r.push(...cur.r, ...next.r);
    pieces.splice(p, 2);
    p--;
  }

  // Leading/trailing whitespace of a change belongs to the surrounding text.
  pieces = pieces.flatMap((pc) => (pc.k === 'chg' ? trimChange(pc) : [pc]));

  const segs: Seg[] = [];
  for (const pc of pieces) {
    if (pc.k === 'eq') {
      if (!pc.r.length) continue;
      segs.push({
        k: 'eq',
        text: b.text.slice(pc.r[0].s, pc.r[pc.r.length - 1].e),
        ls: pc.l[0].s,
        le: pc.l[pc.l.length - 1].e,
        rs: pc.r[0].s,
        re: pc.r[pc.r.length - 1].e,
      });
      continue;
    }
    const before = pc.l.map((t) => t.t).join('');
    const after = pc.r.map((t) => t.t).join('');
    if (isTrivial(before, after, opts)) {
      // Treat as unchanged: show each side's own text without highlight.
      segs.push({
        k: 'eq',
        text: after || before,
        ls: pc.l[0]?.s,
        le: pc.l[pc.l.length - 1]?.e,
        rs: pc.r[0]?.s,
        re: pc.r[pc.r.length - 1]?.e,
      });
      continue;
    }
    if (pc.l.length) segs.push({ k: 'del', text: before, ls: pc.l[0].s, le: pc.l[pc.l.length - 1].e });
    if (pc.r.length) segs.push({ k: 'ins', text: after, rs: pc.r[0].s, re: pc.r[pc.r.length - 1].e });
  }
  return segs;
}

function trimChange(pc: Piece): Piece[] {
  const out: Piece[] = [];
  const lead: Piece = { k: 'eq', l: [], r: [] };
  const tail: Piece = { k: 'eq', l: [], r: [] };
  while (pc.l[0]?.k === 's' && pc.r[0]?.k === 's') {
    lead.l.push(pc.l.shift()!);
    lead.r.push(pc.r.shift()!);
  }
  while (pc.l[pc.l.length - 1]?.k === 's' && pc.r[pc.r.length - 1]?.k === 's') {
    tail.l.unshift(pc.l.pop()!);
    tail.r.unshift(pc.r.pop()!);
  }
  if (lead.l.length) out.push(lead);
  if (pc.l.length || pc.r.length) out.push(pc);
  if (tail.l.length) out.push(tail);
  return out;
}

function isTrivial(before: string, after: string, opts: CompareOptions): boolean {
  const norm = (s: string) => {
    let t = canon(s);
    if (opts.ignorePunctuation) t = t.replace(/[^\p{L}\p{M}\p{N}\s]/gu, '');
    t = t.replace(/\s+/g, '');
    return opts.ignoreCase ? t.toLocaleLowerCase('tr') : t;
  };
  return norm(before) === norm(after);
}

/**
 * Pairs consecutive del/ins segments into readable edits. Attached symbols from
 * the unchanged neighbours are borrowed so "%30", "(otuz)" read whole.
 */
export function editsOf(segs: Seg[]): Edit[] {
  const out: Edit[] = [];
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    if (s.k === 'eq') continue;
    const prev = segs[k - 1]?.k === 'eq' ? segs[k - 1].text : '';
    let before = '';
    let after = '';
    if (s.k === 'del' && segs[k + 1]?.k === 'ins') {
      before = s.text;
      after = segs[++k].text;
    } else if (s.k === 'del') before = s.text;
    else after = s.text;
    const next = segs[k + 1]?.k === 'eq' ? segs[k + 1].text : '';
    const pre = prev.match(/[%(“"'$€₺]+$/u)?.[0] ?? '';
    const post = next.match(/^[)”"'%]+/u)?.[0] ?? '';
    const wrap = (t: string) => (t.trim() ? `${/^\s/.test(t) ? '' : pre}${t.trim()}${/\s$/.test(t) ? '' : post}` : '');
    out.push({ before: wrap(before), after: wrap(after) });
  }
  return out;
}

export function hasChanges(segs: Seg[]): boolean {
  return segs.some((s) => s.k !== 'eq');
}
