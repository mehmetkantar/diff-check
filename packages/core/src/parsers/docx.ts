import JSZip from 'jszip';
import { defaultProfile } from '../profile';
import { clauseOf, looksLikeHeading, splitLabel } from '../text';
import type { Block, DocModel, WarningCode } from '../types';
import { ParseError } from './errors';
import type { ParseContext } from './registry';
import { kids, parseXml } from './xml';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const child = (el: Element | null, name: string) => (el ? kids(el).find((c) => c.localName === name && c.namespaceURI === W) ?? null : null);
const attr = (el: Element | null, name: string) => (el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || null : null);
const isOn = (el: Element | null) => {
  if (!el) return false;
  const v = attr(el, 'val');
  return v === null || !['0', 'false', 'off', 'none'].includes(v);
};
const descendants = (el: Element, name: string) => Array.from(el.getElementsByTagNameNS(W, name)) as Element[];

interface Level {
  start: number;
  fmt: string;
  text: string;
  isLgl: boolean;
}
interface StyleInfo {
  name: string;
  basedOn: string | null;
  numId: string | null;
  ilvl: number | null;
  outline: number | null;
  bold: boolean;
}

async function parseStyles(xml: string | undefined) {
  const map = new Map<string, StyleInfo>();
  if (!xml) return map;
  const doc = await parseXml(xml);
  for (const s of descendants(doc.documentElement, 'style')) {
    const id = attr(s, 'styleId');
    if (!id) continue;
    const pPr = child(s, 'pPr');
    const numPr = child(pPr, 'numPr');
    map.set(id, {
      name: (attr(child(s, 'name'), 'val') ?? id).toLowerCase(),
      basedOn: attr(child(s, 'basedOn'), 'val'),
      numId: attr(child(numPr, 'numId'), 'val'),
      ilvl: child(numPr, 'ilvl') ? Number(attr(child(numPr, 'ilvl'), 'val')) : null,
      outline: child(pPr, 'outlineLvl') ? Number(attr(child(pPr, 'outlineLvl'), 'val')) : null,
      bold: isOn(child(child(s, 'rPr'), 'b')),
    });
  }
  return map;
}

function styleChain(styles: Map<string, StyleInfo>, id: string | null): StyleInfo[] {
  const out: StyleInfo[] = [];
  const seen = new Set<string>();
  while (id && styles.has(id) && !seen.has(id)) {
    seen.add(id);
    const s = styles.get(id)!;
    out.push(s);
    id = s.basedOn;
  }
  return out;
}

interface NumberingDef {
  abstract: Map<string, Map<number, Level>>;
  nums: Map<string, { abs: string; overrides: Map<number, number> }>;
}

async function parseNumbering(xml: string | undefined): Promise<NumberingDef> {
  const abstract = new Map<string, Map<number, Level>>();
  const nums = new Map<string, { abs: string; overrides: Map<number, number> }>();
  if (!xml) return { abstract, nums };
  const doc = await parseXml(xml);
  for (const a of descendants(doc.documentElement, 'abstractNum')) {
    const levels = new Map<number, Level>();
    for (const lvl of descendants(a, 'lvl')) {
      levels.set(Number(attr(lvl, 'ilvl')), {
        start: Number(attr(child(lvl, 'start'), 'val') ?? 1),
        fmt: attr(child(lvl, 'numFmt'), 'val') ?? 'decimal',
        text: attr(child(lvl, 'lvlText'), 'val') ?? '',
        isLgl: !!child(lvl, 'isLgl'),
      });
    }
    abstract.set(attr(a, 'abstractNumId') ?? '', levels);
  }
  for (const n of descendants(doc.documentElement, 'num')) {
    const overrides = new Map<number, number>();
    for (const o of descendants(n, 'lvlOverride')) {
      const so = child(o, 'startOverride');
      if (so) overrides.set(Number(attr(o, 'ilvl')), Number(attr(so, 'val')));
    }
    nums.set(attr(n, 'numId') ?? '', { abs: attr(child(n, 'abstractNumId'), 'val') ?? '', overrides });
  }
  return { abstract, nums };
}

const ROMAN: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
function roman(n: number) {
  let out = '';
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
const letters = (n: number) => String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);

function fmtNum(n: number, fmt: string): string {
  switch (fmt) {
    case 'lowerLetter': return letters(n);
    case 'upperLetter': return letters(n).toUpperCase();
    case 'lowerRoman': return roman(n);
    case 'upperRoman': return roman(n).toUpperCase();
    case 'decimalZero': return String(n).padStart(2, '0');
    case 'none': return '';
    default: return String(n);
  }
}

/** Reproduces Word's automatic list numbers ("5.2.", "(b)") so clause ids match what the reader sees. */
class Numberer {
  private counters = new Map<string, number[]>();
  private started = new Set<string>();
  constructor(private def: NumberingDef) {}

  next(numId: string, ilvl: number): string {
    const num = this.def.nums.get(numId);
    if (!num || numId === '0') return '';
    const levels = this.def.abstract.get(num.abs);
    const lvl = levels?.get(ilvl);
    if (!levels || !lvl) return '';
    // Lists with a start override restart; plain instances of one abstract list continue its count.
    const key = num.overrides.size ? `n${numId}` : `a${num.abs}`;
    let c = this.counters.get(key);
    if (!c || (num.overrides.size && !this.started.has(numId))) {
      c = Array(9).fill(0);
      this.counters.set(key, c);
      this.started.add(numId);
    }
    const startAt = (l: number) => num.overrides.get(l) ?? levels.get(l)?.start ?? 1;
    c[ilvl] = c[ilvl] ? c[ilvl] + 1 : startAt(ilvl);
    for (let d = ilvl + 1; d < 9; d++) c[d] = 0;
    if (lvl.fmt === 'bullet') return '•';
    const counts = c;
    return lvl.text
      .replace(/%(\d)/g, (_, d) => {
        const li = Number(d) - 1;
        return fmtNum(counts[li] || startAt(li), lvl.isLgl ? 'decimal' : levels.get(li)?.fmt ?? 'decimal');
      })
      .trim();
  }
}

interface ParaText {
  text: string;
  boldChars: number;
  chars: number;
  pageBreaks: number;
  breakAtStart: boolean;
}

const SKIP = new Set(['pPr', 'rPr', 'del', 'moveFrom', 'instrText', 'delText', 'footnoteReference', 'endnoteReference', 'commentReference']);

function paraText(p: Element): ParaText {
  let text = '';
  let boldChars = 0;
  let pageBreaks = 0;
  let breakAtStart = false;
  const walk = (el: Element, bold: boolean) => {
    for (const c of kids(el)) {
      if (c.namespaceURI !== W || SKIP.has(c.localName)) continue;
      switch (c.localName) {
        case 'r': {
          const rPr = child(c, 'rPr');
          walk(c, rPr ? isOn(child(rPr, 'b')) : bold);
          break;
        }
        case 't': {
          const t = c.textContent ?? '';
          text += t;
          if (bold) boldChars += t.length;
          break;
        }
        case 'tab':
        case 'ptab':
          text += ' ';
          break;
        case 'br':
        case 'cr':
          if (attr(c, 'type') === 'page') {
            pageBreaks++;
            if (!text.trim()) breakAtStart = true;
          }
          text += ' ';
          break;
        case 'lastRenderedPageBreak':
          // Word records where pages broke at the last save; good enough for "p. 3" hints.
          pageBreaks++;
          if (!text.trim()) breakAtStart = true;
          break;
        case 'noBreakHyphen':
          text += '-';
          break;
        default:
          walk(c, bold);
      }
    }
  };
  walk(p, false);
  return { text, boldChars, chars: text.replace(/\s/g, '').length, pageBreaks, breakAtStart };
}

const HEADING_STYLE = /^(heading|başlık|baslik|überschrift|titre)\s*\d|^title$|^konu başlığı$/;

/** Two-column tables of prose are bilingual (or parallel) layouts, not data tables. */
function isParallelTable(tbl: Element): boolean {
  const rows = kids(tbl).filter((c) => c.localName === 'tr');
  if (rows.length < 3) return false;
  const two = rows.filter((r) => kids(r).filter((c) => c.localName === 'tc').length === 2);
  if (two.length / rows.length < 0.8) return false;
  const lengths = two.flatMap((r) => kids(r).filter((c) => c.localName === 'tc').map((tc) => (tc.textContent ?? '').trim().length));
  return lengths.reduce((a, b) => a + b, 0) / lengths.length > 40;
}

export async function parseDocx(bytes: ArrayBuffer, ctx: ParseContext): Promise<DocModel> {
  const profile = ctx.profile ?? defaultProfile;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ParseError('docx-invalid');
  }
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new ParseError('docx-invalid', 'word/document.xml missing');
  const styles = await parseStyles(await zip.file('word/styles.xml')?.async('string'));
  const numberer = new Numberer(await parseNumbering(await zip.file('word/numbering.xml')?.async('string')));
  const doc = await parseXml(docXml);
  const body = descendants(doc.documentElement, 'body')[0];
  if (!body) throw new ParseError('docx-invalid', 'w:body missing');

  const blocks: Block[] = [];
  const warnings: WarningCode[] = [];
  let page = 1;
  let sawPageMarks = false;
  let group = 0;
  if (descendants(body, 'ins').length + descendants(body, 'del').length > 0) warnings.push('tracked-changes');

  const pushBlock = (b: Omit<Block, 'idx'>) => blocks.push({ ...b, idx: blocks.length });

  const handlePara = (p: Element, extra: Partial<Block> = {}) => {
    const pPr = child(p, 'pPr');
    const chain = styleChain(styles, attr(child(pPr, 'pStyle'), 'val'));
    const numPr = child(pPr, 'numPr');
    let numId = attr(child(numPr, 'numId'), 'val');
    let ilvl = child(numPr, 'ilvl') ? Number(attr(child(numPr, 'ilvl'), 'val')) : null;
    for (const s of chain) {
      if (numId === null && s.numId) numId = s.numId;
      if (ilvl === null && s.ilvl !== null) ilvl = s.ilvl;
    }
    const pt = paraText(p);
    if (pt.pageBreaks) sawPageMarks = true;
    // A break before any text moves this paragraph to the next page; later breaks affect what follows.
    if (pt.breakAtStart) page += 1;
    const startPage = page;
    page += pt.pageBreaks - (pt.breakAtStart ? 1 : 0);
    const label = numId ? numberer.next(numId, ilvl ?? 0) : '';
    const raw = pt.text.replace(/\s+/g, ' ').trim();
    if (!raw) return;

    const headingStyle = chain.find((s) => HEADING_STYLE.test(s.name));
    const outline = (child(pPr, 'outlineLvl') ? Number(attr(child(pPr, 'outlineLvl'), 'val')) : null) ?? chain.find((s) => s.outline !== null)?.outline ?? null;
    const bold = pt.chars > 0 && (pt.boldChars / pt.chars > 0.9 || chain.some((s) => s.bold));
    const jc = attr(child(pPr, 'jc'), 'val');

    const split = label
      ? { label, clause: clauseOf(label, profile), body: raw, bodyStart: label.length + 1 }
      : splitLabel(raw, profile);
    const text = label ? `${label} ${raw}` : raw;
    const levelMatch = headingStyle?.name.match(/\d/);
    const isHeading =
      !!headingStyle || outline !== null || (bold && raw.length < 110 && !/[.;,]$/.test(raw)) || looksLikeHeading(split.body, split.label, profile);
    pushBlock({
      kind: isHeading ? 'heading' : 'para',
      level: isHeading ? (levelMatch ? Number(levelMatch[0]) : outline !== null ? outline + 1 : 2) : ilvl ?? 0,
      text,
      label: split.label,
      clause: split.clause,
      body: split.body,
      bodyStart: split.bodyStart,
      page: startPage,
      bold,
      align: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : undefined,
      ...extra,
    });
  };

  const handleTable = (tbl: Element) => {
    const rows = kids(tbl).filter((c) => c.localName === 'tr');
    if (isParallelTable(tbl)) {
      for (const tr of rows) {
        const cells = kids(tr).filter((c) => c.localName === 'tc');
        const g = group++;
        cells.forEach((tc, ci) => {
          const extra: Partial<Block> = cells.length === 2 ? { col: ci as 0 | 1, group: g } : {};
          for (const p of descendants(tc, 'p')) handlePara(p, extra);
        });
      }
      return;
    }
    for (const tr of rows) {
      const cells = kids(tr)
        .filter((c) => c.localName === 'tc')
        .map((tc) => descendants(tc, 'p').map((p) => paraText(p).text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '));
      if (!cells.some(Boolean)) continue;
      const text = cells.join(' │ ');
      pushBlock({ kind: 'row', level: 0, text, label: '', clause: '', body: text, bodyStart: 0, page });
    }
  };

  const walkBody = (el: Element) => {
    for (const c of kids(el)) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === 'p') handlePara(c);
      else if (c.localName === 'tbl') handleTable(c);
      else if (c.localName === 'sdt') {
        const content = child(c, 'sdtContent');
        if (content) walkBody(content);
      } else if (c.localName === 'customXml' || c.localName === 'ins' || c.localName === 'moveTo') walkBody(c);
    }
  };
  walkBody(body);

  if (!sawPageMarks) for (const b of blocks) delete b.page;
  if (!blocks.length) throw new ParseError('docx-empty');
  return { id: ctx.id, name: ctx.name, kind: 'docx', size: bytes.byteLength, blocks, warnings, pageCount: sawPageMarks ? page : undefined };
}
