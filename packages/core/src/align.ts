import { diffArrays } from 'diff';
import { bag, blockKey, similarity, words, type Bag } from './text';
import type { Block, CompareOptions, Op } from './types';

/** Fewer words than this are too generic to call a move (Litera's default minimum is 5). */
const MIN_MOVE_WORDS = 4;
/** Similarity needed to treat a deleted+inserted pair as the same paragraph, edited. */
const MOD_THRESHOLD = 0.42;
/** Similarity needed to call two paragraphs in different places a move. */
const MOVE_STRONG = 0.72;
const MOVE_WEAK = 0.6;
/** An edited move must still share this many consecutive words (Litera's default minimum is 5). */
const MOVE_RUN = 5;

/** Length of the longest run of identical consecutive words. */
function longestRun(a: string[], b: string[]): number {
  let best = 0;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) best = cur[j];
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return best;
}

interface Gap {
  A: number[];
  B: number[];
}

type Pair = { other: number; move: boolean };

/**
 * Aligns the blocks of two documents.
 *  1. Myers diff on normalised paragraph keys gives the unchanged anchors.
 *  2. Identical paragraphs that changed place become moves.
 *  3. Inside each gap, similar paragraphs are paired in order as edits.
 *  4. Similar paragraphs across gaps become "moved and edited".
 */
export function alignBlocks(L: Block[], R: Block[], opts: CompareOptions): Op[] {
  const kL = L.map((b) => blockKey(b.body, opts));
  const kR = R.map((b) => blockKey(b.body, opts));

  type Item = { eq: [number, number] } | { gap: number };
  const seq: Item[] = [];
  const gaps: Gap[] = [];
  let i = 0;
  let j = 0;
  let cur: Gap | null = null;
  for (const part of diffArrays(kL, kR)) {
    const n = part.value.length;
    if (!part.added && !part.removed) {
      cur = null;
      for (let k = 0; k < n; k++) seq.push({ eq: [i++, j++] });
      continue;
    }
    if (!cur) {
      cur = { A: [], B: [] };
      gaps.push(cur);
      seq.push({ gap: gaps.length - 1 });
    }
    for (let k = 0; k < n; k++) (part.removed ? cur.A : cur.B).push(part.removed ? i++ : j++);
  }

  const gapL = new Map<number, number>();
  const gapR = new Map<number, number>();
  gaps.forEach((g, gi) => {
    g.A.forEach((l) => gapL.set(l, gi));
    g.B.forEach((r) => gapR.set(r, gi));
  });

  const pairL = new Map<number, Pair>();
  const pairR = new Map<number, Pair>();
  const link = (l: number, r: number, move: boolean) => {
    pairL.set(l, { other: r, move });
    pairR.set(r, { other: l, move });
  };

  const bagsL = new Map<number, Bag>();
  const bagsR = new Map<number, Bag>();
  const bL = (l: number) => bagsL.get(l) ?? (bagsL.set(l, bag(L[l].body)), bagsL.get(l)!);
  const bR = (r: number) => bagsR.get(r) ?? (bagsR.set(r, bag(R[r].body)), bagsR.get(r)!);
  const wordsL = new Map<number, string[]>();
  const wordsR = new Map<number, string[]>();
  const wL = (l: number) => wordsL.get(l) ?? (wordsL.set(l, words(L[l].body)), wordsL.get(l)!);
  const wR = (r: number) => wordsR.get(r) ?? (wordsR.set(r, words(R[r].body)), wordsR.get(r)!);
  // Similar vocabulary is not enough to call something moved: a real move keeps a stretch of wording.
  const keepsWording = (l: number, r: number) => longestRun(wL(l), wR(r)) >= Math.min(MOVE_RUN, wL(l).length, wR(r).length);
  const movable = (b: Block) => b.kind === 'heading' || b.body.split(/\s+/).filter(Boolean).length >= MIN_MOVE_WORDS;

  // 2. exact moves
  if (opts.detectMoves) {
    const byKey = new Map<string, number[]>();
    for (const g of gaps) for (const l of g.A) if (movable(L[l])) byKey.set(kL[l], [...(byKey.get(kL[l]) ?? []), l]);
    for (const g of gaps) {
      for (const r of g.B) {
        const cands = byKey.get(kR[r]);
        if (!cands) continue;
        const l = cands.find((c) => !pairL.has(c) && gapL.get(c) !== gapR.get(r));
        if (l !== undefined && movable(R[r])) link(l, r, true);
      }
    }
  }

  const freeA = (g: Gap) => g.A.filter((l) => !pairL.has(l));
  const freeB = (g: Gap) => g.B.filter((r) => !pairR.has(r));

  // 3a. strong cross-gap moves, only when clearly better than any local partner
  if (opts.detectMoves && gaps.length > 1) {
    const bestSameL = new Map<number, number>();
    const bestSameR = new Map<number, number>();
    for (const g of gaps) {
      for (const l of freeA(g)) {
        for (const r of freeB(g)) {
          const s = similarity(bL(l), bR(r));
          if (s > (bestSameL.get(l) ?? 0)) bestSameL.set(l, s);
          if (s > (bestSameR.get(r) ?? 0)) bestSameR.set(r, s);
        }
      }
    }
    const cands: [number, number, number][] = [];
    const allFreeR = gaps.flatMap((g) => freeB(g));
    for (const g of gaps) {
      for (const l of freeA(g)) {
        if (!movable(L[l])) continue;
        for (const r of allFreeR) {
          if (gapR.get(r) === gapL.get(l) || !movable(R[r])) continue;
          const s = similarity(bL(l), bR(r));
          if (s >= MOVE_STRONG && s > (bestSameL.get(l) ?? 0) + 0.1 && s > (bestSameR.get(r) ?? 0) + 0.1 && keepsWording(l, r)) {
            cands.push([s, l, r]);
          }
        }
      }
    }
    cands.sort((a, b) => b[0] - a[0]);
    for (const [, l, r] of cands) if (!pairL.has(l) && !pairR.has(r)) link(l, r, true);
  }

  // 3b. ordered pairing of similar paragraphs inside each gap
  for (const g of gaps) {
    const A = freeA(g);
    const B = freeB(g);
    if (!A.length || !B.length) continue;
    for (const [l, r] of pairInOrder(A, B, (l, r) => {
      const s = similarity(bL(l), bR(r));
      const bonus = L[l].clause && L[l].clause === R[r].clause ? 0.12 : 0;
      const kindPenalty = L[l].kind !== R[r].kind ? 0.1 : 0;
      return s + bonus - kindPenalty;
    })) {
      link(l, r, false);
    }
  }

  // 4. weaker moves among whatever is still unmatched
  if (opts.detectMoves) {
    const restL = gaps.flatMap((g) => freeA(g)).filter((l) => L[l].body.length >= 40);
    const restR = gaps.flatMap((g) => freeB(g)).filter((r) => R[r].body.length >= 40);
    const cands: [number, number, number][] = [];
    for (const l of restL) {
      for (const r of restR) {
        const s = similarity(bL(l), bR(r));
        if (s >= MOVE_WEAK && keepsWording(l, r)) cands.push([s, l, r]);
      }
    }
    cands.sort((a, b) => b[0] - a[0]);
    for (const [, l, r] of cands) if (!pairL.has(l) && !pairR.has(r)) link(l, r, true);
  }

  // 5. emit ops in display order
  const ops: Op[] = [];
  const emitL = (l: number) => {
    const p = pairL.get(l);
    ops.push(p?.move ? { t: 'movsrc', l, r: p.other } : { t: 'del', l });
  };
  const emitR = (r: number) => {
    const p = pairR.get(r);
    ops.push(p?.move ? { t: 'movdst', l: p.other, r } : { t: 'ins', r });
  };
  for (const item of seq) {
    if ('eq' in item) {
      ops.push({ t: 'eq', l: item.eq[0], r: item.eq[1] });
      continue;
    }
    const g = gaps[item.gap];
    const mods = g.A.filter((l) => {
      const p = pairL.get(l);
      return p && !p.move;
    });
    let a = 0;
    let b = 0;
    for (const l of mods) {
      const r = pairL.get(l)!.other;
      while (g.A[a] !== l) emitL(g.A[a++]);
      while (g.B[b] !== r) emitR(g.B[b++]);
      ops.push({ t: 'mod', l, r });
      a++;
      b++;
    }
    while (a < g.A.length) emitL(g.A[a++]);
    while (b < g.B.length) emitR(g.B[b++]);
  }
  return ops;
}

/** Order-preserving best matching (weighted LCS) between two index lists. */
function pairInOrder(A: number[], B: number[], score: (l: number, r: number) => number): [number, number][] {
  const n = A.length;
  const m = B.length;
  const band = n * m > 250_000;
  const dp: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const w: Float64Array[] = Array.from({ length: n }, () => new Float64Array(m));
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < m; y++) {
      if (band && Math.abs(x / n - y / m) > 0.08) {
        w[x][y] = -1;
        continue;
      }
      const s = score(A[x], B[y]);
      w[x][y] = s >= MOD_THRESHOLD ? s : -1;
    }
  }
  for (let x = 1; x <= n; x++) {
    for (let y = 1; y <= m; y++) {
      let best = Math.max(dp[x - 1][y], dp[x][y - 1]);
      const s = w[x - 1][y - 1];
      if (s > 0) best = Math.max(best, dp[x - 1][y - 1] + s);
      dp[x][y] = best;
    }
  }
  const out: [number, number][] = [];
  let x = n;
  let y = m;
  while (x > 0 && y > 0) {
    const s = w[x - 1][y - 1];
    if (s > 0 && dp[x][y] === dp[x - 1][y - 1] + s) {
      out.push([A[x - 1], B[y - 1]]);
      x--;
      y--;
    } else if (dp[x][y] === dp[x - 1][y]) x--;
    else y--;
  }
  return out.reverse();
}
