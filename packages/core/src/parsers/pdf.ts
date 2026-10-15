import type { PDFDocumentProxy } from 'pdfjs-dist';
import { defaultProfile, type Profile } from '../profile';
import { looksLikeHeading, splitLabel } from '../text';
import type { OcrWord } from '../ocr/types';
import type { Block, DocModel, WordBox } from '../types';
import { ParseError } from './errors';
import type { ParseContext } from './registry';

type PdfJs = typeof import('pdfjs-dist');

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export interface PdfConfig {
  /** URL of pdf.worker(.min).mjs served by the host; needed when the CSP forbids blob: workers */
  workerSrc?: string;
  /** An already constructed pdf.js worker */
  workerPort?: Worker;
}

let config: PdfConfig = {};
let lib: Promise<PdfJs> | null = null;

/** Call before the first PDF is parsed to control how the pdf.js worker is loaded. */
export function configurePdf(c: PdfConfig) {
  config = c;
  lib = null;
}

function loadPdfJs(): Promise<PdfJs> {
  lib ??= (async () => {
    if (!isBrowser) {
      // Node (CLI, server-side compare): the legacy build runs with an in-process worker.
      // A runtime specifier keeps browser bundlers from shipping this chunk.
      const nodeBuild = 'pdfjs-dist/legacy/build/pdf.mjs';
      return (await import(/* @vite-ignore */ nodeBuild)) as unknown as PdfJs;
    }
    const pdfjs = await import('pdfjs-dist');
    if (config.workerPort) pdfjs.GlobalWorkerOptions.workerPort = config.workerPort;
    else if (config.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = config.workerSrc;
    else {
      // Default: the worker is bundled inline, so nothing extra has to be served.
      const { createPdfWorker } = await import('./pdf-worker');
      pdfjs.GlobalWorkerOptions.workerPort = createPdfWorker();
    }
    return pdfjs;
  })();
  return lib;
}

const documents = new Map<string, PDFDocumentProxy>();
/** The pdf.js document behind a parsed DocModel, for page rendering. */
export const getPdfDocument = (id: string) => documents.get(id);
export const releasePdfDocument = (id: string) => {
  void documents.get(id)?.loadingTask.destroy();
  documents.delete(id);
};

interface Frag {
  str: string;
  x: number;
  base: number;
  w: number;
  size: number;
}
interface Box {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Word {
  t: string;
  boxes: Box[];
  /** separator placed before this word when building text */
  sep: string;
}
interface Line {
  frags: Frag[];
  page: number;
  base: number;
  size: number;
  x0: number;
  x1: number;
  words: Word[];
  text: string;
  cells: boolean;
  col?: 0 | 1;
}

const median = (xs: number[], fallback: number) => {
  if (!xs.length) return fallback;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const quantile = (xs: number[], q: number, fallback: number) => {
  if (!xs.length) return fallback;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};

// "3", "- 3 -", "3/12", "Page 3 of 12", "Sayfa 3 / 12", bilingual "Sayfa / Page 3"
const PAGE_WORD = '(?:sayfa|page|seite|s\\.|p\\.)';
const PAGE_NO = new RegExp(`^(?:${PAGE_WORD}(?:\\s*\\/\\s*${PAGE_WORD})?\\s*)?[-–]?\\s*\\d{1,4}\\s*(?:(?:\\/|of|von)\\s*\\d{1,4})?\\s*[-–]?$`, 'i');

export async function parsePdf(bytes: ArrayBuffer, ctx: ParseContext): Promise<DocModel> {
  const profile = ctx.profile ?? defaultProfile;
  const pdfjs = await loadPdfJs();
  let pdf: PDFDocumentProxy;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), enableXfa: false, verbosity: 0 }).promise;
  } catch (e) {
    if ((e as { name?: string })?.name === 'PasswordException') throw new ParseError('pdf-password');
    throw new ParseError('pdf-invalid', (e as Error)?.message);
  }
  documents.set(ctx.id, pdf);

  const pages: { width: number; height: number }[] = [];
  const pageFrags: Frag[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ width: vp.width, height: vp.height });
    const tc = await page.getTextContent();
    const frags: Frag[] = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str || !it.str.trim()) continue;
      const [, , c, d, e, f] = it.transform as number[];
      const [x, base] = vp.convertToViewportPoint(e, f);
      frags.push({ str: it.str.normalize('NFKC'), x, base, w: it.width, size: Math.hypot(c, d) || it.height || 10 });
    }
    pageFrags.push(frags);
  }

  // Scanned pages (no text layer) go through the OCR provider, when the host configured one.
  let ocr: DocModel['ocr'];
  const blank = pageFrags.flatMap((fs, i) => (fs.reduce((n, f) => n + f.str.trim().length, 0) < 10 ? [i] : []));
  if (blank.length && ctx.ocr) {
    const data = new Uint8Array(bytes);
    for (const [k, i] of blank.entries()) {
      if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      ctx.onProgress?.({ phase: 'ocr', page: k + 1, pages: blank.length });
      let words: OcrWord[];
      try {
        words = await ctx.ocr.recognize(
          { pageNo: i + 1, pageCount: pdf.numPages, ...pages[i], pdf: data, render: isBrowser ? (scale) => renderToCanvas(pdf, i + 1, scale) : undefined },
          ctx.signal,
        );
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        throw new ParseError('ocr-failed', (e as Error)?.message);
      }
      pageFrags[i] = ocrFragments(words);
    }
    ocr = 'engine';
  } else if (await hasOcrLayer(pdf, pdfjs)) ocr = 'layer';

  // Running headers/footers are found on full-width lines, before any column split.
  const kept = dropRunningText(pageFrags.map((f, i) => buildLines(f, i + 1)), pages);
  const keptFrags = new Set(kept.flatMap((l) => l.frags));
  const bodyFrags = pageFrags.map((fs) => fs.filter((f) => keptFrags.has(f)));
  if (kept.reduce((n, l) => n + l.text.length, 0) < 20) throw new ParseError('pdf-no-text');

  // Parallel columns: detect a gutter per page; pages with little text reuse the document's gutter.
  const gutters = bodyFrags.map((fs, i) => findGutter(fs, pages[i].width));
  const found = gutters.filter((g): g is number => g !== null);
  const docGutter = found.length ? found.sort((a, b) => a - b)[Math.floor(found.length / 2)] : null;
  const lines: Line[] = [];
  bodyFrags.forEach((fs, i) => {
    let gutter = gutters[i];
    if (gutter === null && docGutter !== null && gutterIsClear(fs, docGutter)) gutter = docGutter;
    if (gutter === null) {
      lines.push(...buildLines(fs, i + 1));
      return;
    }
    const g = gutter;
    lines.push(
      ...buildLines(fs.filter((f) => f.x + f.w / 2 < g), i + 1).map((l) => ({ ...l, col: 0 as const })),
      ...buildLines(fs.filter((f) => f.x + f.w / 2 >= g), i + 1).map((l) => ({ ...l, col: 1 as const })),
    );
  });

  // Each column is its own reading stream; paragraphs are then interleaved by position.
  const streams = [lines.filter((l) => l.col === undefined), lines.filter((l) => l.col === 0), lines.filter((l) => l.col === 1)];
  const paras = streams.flatMap((s) => segment(s, profile));
  paras.sort((a, b) => a[0].page - b[0].page || a[0].base - b[0].base || (a[0].col ?? -1) - (b[0].col ?? -1));
  const groups = rowGroups(paras);
  const blocks = paras.map((pl, idx) => toBlock(pl, idx, lines, profile, groups[idx]));
  const warnings: DocModel['warnings'] = ocr === 'engine' ? ['ocr-engine'] : ocr === 'layer' ? ['ocr-text'] : [];
  return { id: ctx.id, name: ctx.name, kind: 'pdf', size: bytes.byteLength, blocks, pageCount: pdf.numPages, pages, warnings, ocr };
}

/**
 * OCR word boxes vary in height ("a" vs "Ğ", a hyphen floats mid-line), which
 * would split lines and fake font-size changes. Words are grouped into lines
 * (by the engine's line ids, or by vertical overlap), and every word in a line
 * gets the line's baseline and a page-level body size.
 */
function ocrFragments(words: OcrWord[]): Frag[] {
  const ws = words.filter((w) => w.text.trim());
  const lines: OcrWord[][] = [];
  if (ws.length && ws.every((w) => w.line !== undefined)) {
    const byId = new Map<number, OcrWord[]>();
    for (const w of ws) byId.set(w.line!, [...(byId.get(w.line!) ?? []), w]);
    lines.push(...byId.values());
  } else {
    for (const w of [...ws].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))) {
      const mid = w.y + w.h / 2;
      const line = lines.find((l) => {
        const top = median(l.map((x) => x.y), 0);
        const bottom = median(l.map((x) => x.y + x.h), 0);
        return mid >= top && mid <= bottom;
      });
      if (line) line.push(w);
      else lines.push([w]);
    }
  }
  const wordy = (w: OcrWord) => /[\p{L}\p{N}]{2,}/u.test(w.text);
  const bodyH = median(ws.filter(wordy).map((w) => w.h), 10);
  const frags: Frag[] = [];
  for (const line of lines) {
    const ref = line.some(wordy) ? line.filter(wordy) : line;
    const base = median(ref.map((w) => w.y + w.h), 0);
    let h = quantile(ref.map((w) => w.h), 0.8, bodyH);
    if (Math.abs(h - bodyH) < bodyH * 0.35) h = bodyH;
    // Reconstructed boxes span baseline - 0.82 size .. baseline + 0.2 size.
    const size = h / 0.9;
    for (const w of line) frags.push({ str: w.text.normalize('NFKC'), x: w.x, base, w: w.w, size });
  }
  return frags;
}

const OCR_PRODUCERS = /tesseract|ocrmypdf|abbyy|finereader|paper capture|readiris|omnipage|scansnap|kofax|nuance|docuware|capture/i;

/**
 * A searchable scan: a page image with an invisible OCR text layer on top
 * (text render mode 3). Checked on the first pages only; the producer
 * metadata is tried first because it is cheaper.
 */
async function hasOcrLayer(pdf: PDFDocumentProxy, pdfjs: PdfJs): Promise<boolean> {
  try {
    const meta = (await pdf.getMetadata()) as { info?: { Producer?: string; Creator?: string } };
    if (OCR_PRODUCERS.test(`${meta.info?.Producer ?? ''} ${meta.info?.Creator ?? ''}`)) return true;
    const { OPS } = pdfjs;
    const images = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat]);
    for (let p = 1; p <= Math.min(pdf.numPages, 2); p++) {
      const list = await (await pdf.getPage(p)).getOperatorList();
      let invisible = false;
      let image = false;
      list.fnArray.forEach((fn, i) => {
        if (fn === OPS.setTextRenderingMode && (list.argsArray[i] as number[])[0] === 3) invisible = true;
        if (images.has(fn)) image = true;
      });
      if (invisible && image) return true;
    }
  } catch {
    // Detection is best effort; a failure just means no OCR hints.
  }
  return false;
}

async function renderToCanvas(pdf: PDFDocumentProxy, pageNo: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, viewport: vp }).promise;
  return canvas;
}

/** True when no text crosses x and there is text on both sides of it. */
function gutterIsClear(frags: Frag[], x: number): boolean {
  let left = 0;
  let right = 0;
  for (const f of frags) {
    if (f.x < x - 2 && f.x + f.w > x + 2) return false;
    if (f.x + f.w / 2 < x) left++;
    else right++;
  }
  return left > 0 && right > 0;
}

/** x of an empty vertical band that splits the page into two text columns, or null. */
function findGutter(frags: Frag[], width: number): number | null {
  if (frags.length < 16) return null;
  const tolerance = Math.max(1, Math.floor(frags.length * 0.015));
  let run: [number, number] | null = null;
  let best: [number, number] | null = null;
  for (let x = width * 0.3; x <= width * 0.7; x += 2) {
    let cross = 0;
    let left = 0;
    let right = 0;
    for (const f of frags) {
      if (f.x < x - 2 && f.x + f.w > x + 2) cross++;
      else if (f.x + f.w / 2 < x) left++;
      else right++;
    }
    const ok = cross <= tolerance && left >= frags.length * 0.2 && right >= frags.length * 0.2;
    if (ok) run = run ? [run[0], x] : [x, x];
    if (!ok || x + 2 > width * 0.7) {
      if (run && (!best || run[1] - run[0] > best[1] - best[0])) best = run;
      if (!ok) run = null;
    }
  }
  if (!best || best[1] - best[0] < 6) return null;
  return (best[0] + best[1]) / 2;
}

function buildLines(frags: Frag[], page: number): Line[] {
  frags.sort((a, b) => a.base - b.base || a.x - b.x);
  const groups: Frag[][] = [];
  for (const f of frags) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g[0].base - f.base) <= Math.min(g[0].size, f.size) * 0.45) g.push(f);
    else groups.push([f]);
  }
  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x);
    const size = median(g.map((f) => f.size), 10);
    const words: Word[] = [];
    let prevEnd = -Infinity;
    let prevEndsSpace = true;
    let cells = false;
    for (const f of g) {
      const gap = f.x - prevEnd;
      const cw = f.w / Math.max(1, f.str.length);
      const startsSpace = /^\s/.test(f.str);
      let first = true;
      for (const m of f.str.matchAll(/\S+/g)) {
        const box: Box = { page, x: f.x + (m.index ?? 0) * cw, y: f.base - size * 0.82, w: m[0].length * cw, h: size * 1.02 };
        // Fragments split mid-word (kerning, font switches) are glued back together.
        const glue = first && words.length > 0 && !prevEndsSpace && !startsSpace && gap < size * 0.16;
        if (glue) {
          const last = words[words.length - 1];
          last.t += m[0];
          last.boxes.push(box);
        } else {
          const bigGap = first && words.length > 0 && gap > Math.max(size * 2.2, 18);
          if (bigGap) cells = true;
          words.push({ t: m[0], boxes: [box], sep: words.length === 0 ? '' : bigGap ? ' │ ' : ' ' });
        }
        first = false;
      }
      prevEnd = f.x + f.w;
      prevEndsSpace = /\s$/.test(f.str);
    }
    const text = words.map((w) => w.sep + w.t).join('');
    return { frags: g, page, base: g[0].base, size, x0: g[0].x, x1: prevEnd, words, text, cells };
  });
}

/** Removes headers, footers and page numbers that repeat on every page. */
function dropRunningText(pageLines: Line[][], pages: { width: number; height: number }[]): Line[] {
  const n = pageLines.length;
  const key = (l: Line) => l.text.replace(/\d+/g, '#').toLowerCase().replace(/\s+/g, ' ').trim();
  const zone = (l: Line) => {
    const h = pages[l.page - 1].height;
    return l.base < h * 0.1 || l.base > h * 0.9;
  };
  const counts = new Map<string, number>();
  for (const ls of pageLines) {
    const byPos = [...ls].sort((a, b) => a.base - b.base);
    const seen = new Set<string>();
    for (const l of [...byPos.slice(0, 2), ...byPos.slice(-2)]) if (zone(l)) seen.add(key(l));
    seen.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  }
  const out: Line[] = [];
  for (const ls of pageLines) {
    for (const l of ls) {
      if (zone(l) && (PAGE_NO.test(l.text.trim()) || (n >= 2 && (counts.get(key(l)) ?? 0) >= Math.max(2, n * 0.5)))) continue;
      out.push(l);
    }
  }
  return out;
}

const TERMINAL = /[.:;!?)"”]$/u;

/** Splits one reading stream of lines into paragraphs. */
function segment(lines: Line[], profile: Profile): Line[][] {
  if (!lines.length) return [];
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const d = lines[i].base - lines[i - 1].base;
    if (lines[i].page === lines[i - 1].page && d > 0 && d < lines[i].size * 3) gaps.push(d);
  }
  const lineGap = median(gaps, 14);
  const bodySize = median(lines.map((l) => l.size), 10);
  const right = quantile(lines.map((l) => l.x1), 0.9, 500);
  const left = quantile(lines.map((l) => l.x0), 0.1, 50);
  const lineIsHeading = (l: Line) => {
    const s = splitLabel(l.text, profile);
    return l.text.length < 110 && looksLikeHeading(s.body, s.label, profile);
  };

  const paras: Line[][] = [];
  let cur: Line[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const prev = lines[i - 1];
    let brk = cur.length === 0;
    if (!brk && prev) {
      const prevText = prev.text.trim();
      const headingWraps =
        lineIsHeading(prev) && lineIsHeading(l) && !splitLabel(l.text, profile).label && l.page === prev.page && l.base - prev.base <= lineGap * 1.3;
      if (l.cells || prev.cells) brk = true;
      else if (headingWraps) brk = false;
      else if (splitLabel(l.text, profile).label || lineIsHeading(l) || lineIsHeading(prev)) brk = true;
      else if (Math.abs(l.size - prev.size) > prev.size * 0.2) brk = true;
      // Across a page break a paragraph continues unless the last line clearly ended one.
      else if (l.page !== prev.page) brk = TERMINAL.test(prevText) && prev.x1 < right - (right - left) * 0.1;
      else if (l.base - prev.base > lineGap * 1.45) brk = true;
      else if (TERMINAL.test(prevText) && prev.x1 < right - (right - left) * 0.12) brk = true;
      else if (TERMINAL.test(prevText) && l.x0 > left + bodySize * 1.2 && l.x0 - prev.x0 > bodySize) brk = true;
    }
    if (brk && cur.length) {
      paras.push(cur);
      cur = [];
    }
    cur.push(l);
  }
  if (cur.length) paras.push(cur);
  return paras;
}

/**
 * Parallel columns: a new row starts where both columns begin a paragraph at
 * the same height. Paragraphs between two row starts belong to the same row.
 */
function rowGroups(paras: Line[][]): (number | undefined)[] {
  const starts = paras.filter((p) => p[0].col !== undefined).map((p) => p[0]);
  const tol = (l: Line) => l.size * 0.8;
  const isRowStart = (l: Line) => starts.some((o) => o.col !== l.col && o.page === l.page && Math.abs(o.base - l.base) <= tol(l));
  const out: (number | undefined)[] = [];
  let group = -1;
  let lastStart: Line | null = null;
  for (const p of paras) {
    const first = p[0];
    if (first.col === undefined) {
      out.push(undefined);
      continue;
    }
    if (isRowStart(first) && !(lastStart && lastStart.page === first.page && Math.abs(lastStart.base - first.base) <= tol(first))) {
      group++;
      lastStart = first;
    }
    out.push(Math.max(group, 0));
  }
  return out;
}

function toBlock(pl: Line[], idx: number, all: Line[], profile: Profile, group: number | undefined): Block {
  const ws: Word[] = [];
  for (const l of pl) {
    l.words.forEach((w, k) => {
      const last = ws[ws.length - 1];
      // Re-join words hyphenated across a line break: "agree-" + "ment"
      if (k === 0 && last && /\p{L}-$/u.test(last.t) && /^\p{Ll}/u.test(w.t)) {
        last.t = last.t.slice(0, -1) + w.t;
        last.boxes.push(...w.boxes);
        return;
      }
      ws.push({ ...w, sep: k === 0 ? (ws.length ? ' ' : '') : w.sep });
    });
  }
  let text = '';
  const boxes: WordBox[] = [];
  for (const w of ws) {
    text += w.sep;
    const start = text.length;
    text += w.t;
    for (const b of w.boxes) boxes.push({ ...b, start, end: text.length });
  }
  const bodySize = median(all.map((l) => l.size), 10);
  const split = splitLabel(text, profile);
  const isRow = pl.length === 1 && pl[0].cells && pl[0].col === undefined;
  const heading = !isRow && pl.length <= 2 && (looksLikeHeading(split.body, split.label, profile) || pl[0].size > bodySize * 1.25);
  const col = pl[0].col;
  return {
    idx,
    kind: isRow ? 'row' : heading ? 'heading' : 'para',
    level: heading ? (pl[0].size > bodySize * 1.25 ? 1 : 2) : 0,
    text,
    label: isRow ? '' : split.label,
    clause: isRow ? '' : split.clause,
    body: isRow ? text : split.body,
    bodyStart: isRow ? 0 : split.bodyStart,
    page: pl[0].page,
    boxes,
    ...(col !== undefined ? { col, group } : {}),
  };
}

/** Renders one page into a canvas at the given CSS width; returns the scale used. */
export async function renderPdfPage(id: string, pageNo: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<number | null> {
  const pdf = documents.get(id);
  if (!pdf) return null;
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = cssWidth / base.width;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${scale * base.height}px`;
  await page.render({ canvas, viewport: vp }).promise;
  return scale;
}
