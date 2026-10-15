import { alignBlocks } from './align';
import { flagsOf } from './flags';
import { editsOf, hasChanges, inlineDiff } from './inline';
import { ocrLikely } from './ocr/likely';
import { defaultProfile } from './profile';
import { guessLang, isArticleLabel, shorten, titleCase } from './text';
import type { Profile } from './profile';
import type {
  Block, Change, ChangeType, Comparison, CompareOptions, DocModel, Loc, Op, Row, Section, Seg, Subject,
} from './types';
import { defaultOptions } from './types';

/** Stable id of a change across re-comparisons (e.g. to persist "reviewed" state). */
export function changeKey(c: Pick<Change, 'type' | 'l' | 'r'>): string {
  return `${c.type}:${c.l.join(',')}:${c.r.join(',')}`;
}

export function rowKey(op: Op): string {
  switch (op.t) {
    case 'eq':
    case 'mod':
      return `p${op.l}-${op.r}`;
    case 'del':
      return `l${op.l}`;
    case 'ins':
      return `r${op.r}`;
    case 'movsrc':
      return `ms${op.l}`;
    case 'movdst':
      return `md${op.r}`;
  }
}

/** Location (clause number, heading, page) of every block, plus the heading-delimited sections. */
/** Language of a whole document, used for casing headings. */
const docLang = (blocks: Block[]) => guessLang(blocks.map((b) => b.body).join(' ').slice(0, 40_000));

function locate(blocks: Block[], side: 'L' | 'R', opts: CompareOptions): { locs: Loc[]; sections: Section[] } {
  const profile = opts.profile ?? defaultProfile;
  const lang = docLang(blocks);
  const locs: Loc[] = [];
  const sections: Section[] = [];
  // Bilingual documents keep a separate clause context per column.
  const ctx = new Map<number, { title: string; top: string; num: string }>();
  for (const b of blocks) {
    const key = b.col ?? -1;
    const c = ctx.get(key) ?? { title: '', top: '', num: '' };
    ctx.set(key, c);
    if (b.kind === 'heading') {
      const t = titleCase(b.body, profile, b.lang ?? lang);
      c.title = t || b.label || c.title;
      if (/^\d/.test(b.clause)) c.top = c.num = b.clause;
      const prev = [...sections].reverse().find((s) => (blocks[s.block].col ?? -1) === key);
      if (prev) prev.end = b.idx;
      sections.push({ side, block: b.idx, clause: b.clause, title: t || b.label, start: b.idx, end: blocks.length });
    }
    let clause: string;
    if (/^\d/.test(b.clause)) {
      // "1." under "MADDE 4" reads as 4.1 to a lawyer; dotted ids are already absolute.
      clause = b.kind !== 'heading' && !b.clause.includes('.') && c.top && b.clause !== c.top ? `${c.top}.${b.clause}` : b.clause;
      if (b.kind !== 'heading') c.num = clause;
    } else if (b.clause) clause = `${c.num || c.top} (${b.clause})`.trim();
    else clause = c.num || c.top;
    locs.push({ clause, title: c.title, page: b.page, para: b.idx + 1 });
  }
  return { locs, sections };
}

function headingSubject(b: Block, opts: CompareOptions, lang: string): Subject {
  const profile = opts.profile ?? defaultProfile;
  return { kind: 'heading', name: titleCase(b.body, profile, b.lang ?? lang) || b.label, article: isArticleLabel(b.label, profile) };
}

export function compareDocs(left: DocModel, right: DocModel, options: Partial<CompareOptions> = {}): Comparison {
  const opts: CompareOptions = { ...defaultOptions, ...options };
  const profile = opts.profile ?? defaultProfile;
  const L = left.blocks;
  const R = right.blocks;
  const ops = alignBlocks(L, R, opts);
  const { locs: locL, sections: sectionsL } = locate(L, 'L', opts);
  const { locs: locR, sections: sectionsR } = locate(R, 'R', opts);
  const langL = docLang(L);
  const langR = docLang(R);

  const inline = new Map<string, Seg[]>();
  const segsOf = (l: number, r: number) => {
    const k = `${l}:${r}`;
    let s = inline.get(k);
    if (!s) inline.set(k, (s = inlineDiff(L[l], R[r], opts)));
    return s;
  };

  // A "mod" that only differed in ignored ways renders as unchanged.
  const finalOps: Op[] = ops.map((op) => (op.t === 'mod' && !hasChanges(segsOf(op.l, op.r)) ? { t: 'eq', l: op.l, r: op.r } : op));

  const rows: Row[] = finalOps.map((op) => ({ key: rowKey(op), op }));
  const rowIndex = new Map(rows.map((row, i) => [row.key, i]));
  const changes: Change[] = [];
  const changeOfL = new Map<number, string>();
  const changeOfR = new Map<number, string>();

  // Group moved runs: consecutive destination paragraphs that were also consecutive before.
  const moveSrcOfR = new Map<number, number>();
  const moveGroupOfR = new Map<number, number[]>();
  for (let k = 0; k < finalOps.length; k++) {
    const op = finalOps[k];
    if (op.t !== 'movdst') continue;
    moveSrcOfR.set(op.r, op.l);
    const group = [op];
    while (k + 1 < finalOps.length) {
      const nx = finalOps[k + 1];
      if (nx.t === 'movdst' && nx.l === group[group.length - 1].l + 1) {
        group.push(nx);
        moveSrcOfR.set(nx.r, nx.l);
        k++;
      } else break;
    }
    const rs = group.map((g) => g.r);
    rs.forEach((r) => moveGroupOfR.set(r, rs));
  }

  let n = 0;
  let renumHidden = 0;
  const add = (c: Omit<Change, 'id' | 'n' | 'lang'>) => {
    const id = `c${++n}`;
    const anchor = c.r.length ? R[c.r[0]] : L[c.l[0]];
    const full: Change = { ...c, id, n, lang: anchor?.lang };
    changes.push(full);
    full.l.forEach((l) => changeOfL.set(l, id));
    full.r.forEach((r) => changeOfR.set(r, id));
    full.rows.forEach((key) => {
      const ri = rowIndex.get(key);
      if (ri !== undefined) rows[ri].changeId = id;
    });
  };

  for (let k = 0; k < finalOps.length; k++) {
    const op = finalOps[k];
    if (op.t === 'eq') {
      const a = L[op.l];
      const b = R[op.r];
      const renumbered = a.label !== b.label && !!(a.label || b.label) && a.label !== '•';
      if (renumbered && !opts.showRenumbering) renumHidden++;
      if (renumbered && opts.showRenumbering) {
        add({
          type: 'renum',
          l: [op.l],
          r: [op.r],
          locL: locL[op.l],
          locR: locR[op.r],
          subject: b.kind === 'heading' ? headingSubject(b, opts, langR) : { kind: 'para' },
          edits: [],
          flags: [],
          rows: [rowKey(op)],
          excerpt: shorten(b.body, 120),
          renum: { from: a.label, to: b.label },
        });
      }
      continue;
    }
    if (op.t === 'mod') {
      const edits = editsOf(segsOf(op.l, op.r));
      add({
        type: 'mod',
        l: [op.l],
        r: [op.r],
        locL: locL[op.l],
        locR: locR[op.r],
        subject: R[op.r].kind === 'row' ? { kind: 'row' } : R[op.r].kind === 'heading' ? headingSubject(R[op.r], opts, langR) : { kind: 'para' },
        edits,
        flags: flagsOf(edits, profile),
        rows: [rowKey(op)],
        excerpt: shorten(R[op.r].body, 120),
      });
      continue;
    }
    if (op.t === 'ins' || op.t === 'del') {
      // Consecutive inserted (or deleted) paragraphs are one change, e.g. a whole new article.
      const idx = [op.t === 'ins' ? op.r : op.l];
      const keys = [rowKey(op)];
      while (k + 1 < finalOps.length && finalOps[k + 1].t === op.t) {
        const nx = finalOps[++k] as typeof op;
        idx.push(nx.t === 'ins' ? nx.r : (nx as Extract<Op, { t: 'del' }>).l);
        keys.push(rowKey(nx));
      }
      const side = op.t === 'ins' ? R : L;
      const blocks = idx.map((i) => side[i]);
      const head = blocks.find((b) => b.kind === 'heading');
      const text = blocks.map((b) => b.body).join(' ');
      const subject: Subject = head
        ? headingSubject(head, opts, op.t === 'ins' ? langR : langL)
        : blocks.length > 1
          ? { kind: 'paras', count: blocks.length }
          : blocks[0].kind === 'row'
            ? { kind: 'row' }
            : { kind: 'para' };
      const edits = op.t === 'ins' ? [{ before: '', after: text }] : [{ before: text, after: '' }];
      add({
        type: op.t,
        l: op.t === 'del' ? idx : [],
        r: op.t === 'ins' ? idx : [],
        locL: op.t === 'del' ? locL[idx[0]] : undefined,
        locR: op.t === 'ins' ? locR[idx[0]] : undefined,
        subject,
        edits,
        flags: flagsOf(edits, profile),
        rows: keys,
        excerpt: shorten(text, 140),
      });
      continue;
    }
    if (op.t === 'movdst') {
      const rs = moveGroupOfR.get(op.r)!;
      if (rs[0] !== op.r) continue;
      const ls = rs.map((r) => moveSrcOfR.get(r)!);
      const edits = rs.flatMap((r, x) => editsOf(segsOf(ls[x], r)));
      const head = rs.map((r) => R[r]).find((b) => b.kind === 'heading');
      add({
        type: 'move',
        l: ls,
        r: rs,
        locL: locL[ls[0]],
        locR: locR[rs[0]],
        subject: head ? headingSubject(head, opts, langR) : rs.length > 1 ? { kind: 'paras', count: rs.length } : { kind: 'para' },
        edits,
        flags: flagsOf(edits, profile),
        moveEdited: edits.length > 0,
        rows: [...rs.map((r) => `md${r}`), ...ls.map((l) => `ms${l}`)],
        excerpt: shorten(rs.map((r) => R[r].body).join(' '), 140),
      });
    }
  }

  markUnmirrored(changes, L, R);
  if (left.ocr || right.ocr) markOcrNoise(changes, profile);

  const stats = { mod: 0, ins: 0, del: 0, move: 0, renum: 0, total: changes.length, flagged: 0, renumHidden, ocr: 0 } as Comparison['stats'];
  for (const c of changes) {
    stats[c.type as ChangeType]++;
    if (c.flags.includes('ocr')) stats.ocr++;
    else if (c.flags.length) stats.flagged++;
  }

  return {
    left,
    right,
    options: opts,
    ops: finalOps,
    rows,
    changes,
    locL,
    locR,
    sectionsL,
    sectionsR,
    inline,
    changeOfL,
    changeOfR,
    langs: right.langs ?? left.langs,
    stats,
  };
}

/**
 * OCR'd documents: an edit that can be explained by typical misreadings is
 * labelled 'ocr' instead of figures/legal, so reviewers can triage scanner
 * noise. Mixed changes keep their real edits first and are flagged from those.
 */
function markOcrNoise(changes: Change[], profile: Profile) {
  for (const c of changes) {
    if (c.type !== 'mod' || !c.edits.length) continue;
    const noise = c.edits.filter((e) => ocrLikely(e.before, e.after));
    if (!noise.length) continue;
    if (noise.length === c.edits.length) {
      c.flags = ['ocr'];
      continue;
    }
    const real = c.edits.filter((e) => !noise.includes(e));
    c.edits = [...real, ...noise];
    c.flags = flagsOf(real, profile).concat(c.flags.filter((f) => f === 'unmirrored'));
  }
}

/**
 * Bilingual documents: a paragraph that changed in one language while its
 * translation (same group, other column) did not is a classic drafting slip.
 */
function markUnmirrored(changes: Change[], L: Block[], R: Block[]) {
  const touched = new Set<string>();
  const sideBlocks = (c: Change): [string, Block[]] => (c.r.length ? ['R', c.r.map((i) => R[i])] : ['L', c.l.map((i) => L[i])]);
  for (const c of changes) {
    const [side, blocks] = sideBlocks(c);
    for (const b of blocks) if (b.group !== undefined && b.col !== undefined) touched.add(`${side}${b.group}:${b.col}`);
    // A move is a change on both sides of the old document too.
    if (c.type === 'move') for (const i of c.l) if (L[i].group !== undefined) touched.add(`L${L[i].group}:${L[i].col}`);
  }
  for (const c of changes) {
    if (c.type === 'renum' || c.type === 'move') continue;
    const [side, blocks] = sideBlocks(c);
    // Also true when the translation cell is simply empty.
    const lonely = blocks.some((b) => b.group !== undefined && b.col !== undefined && !touched.has(`${side}${b.group}:${1 - b.col}`));
    if (lonely && !c.flags.includes('unmirrored')) c.flags.push('unmirrored');
  }
}
