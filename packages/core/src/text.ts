import { defaultProfile, type Profile } from './profile';
import type { CompareOptions } from './types';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DOTTED_RE = /^(\d{1,3}(?:\.\d{1,3})+)\.?(?=\s)\s*/u;
const SIMPLE_RE = /^(\d{1,3})[.)](?=\s)\s*/u;
const LETTER_RE = /^(\p{Ll}|[ivx]{1,5})[).](?=\s)\s*/u;
const PAREN_RE = /^\((\p{Ll}|[ivx]{1,5}|\d{1,3})\)(?=\s)\s*/u;
const BULLET_RE = /^[•▪◦●■‣⁃·\-–—]\s+/u;

interface Matchers {
  article: RegExp;
  articleStart: RegExp;
}
const matcherCache = new WeakMap<Profile, Matchers>();

function matchers(profile: Profile): Matchers {
  let m = matcherCache.get(profile);
  if (!m) {
    const words = profile.articleWords.map(escape).join('|');
    m = {
      article: new RegExp(`^(${words})\\s*(\\d+(?:\\.\\d+)*|[IVXLC]+)\\b\\s*([.:)\\-–—]\\s*)?`, 'u'),
      articleStart: new RegExp(`^(${words})`, 'u'),
    };
    matcherCache.set(profile, m);
  }
  return m;
}

/** Turkish casing rules (dotted/dotless i) for Turkish text: by its letters, or by the document language. */
export const caseLocale = (s: string, lang?: string) => (lang === 'tr' || /[çğıöşüÇĞİÖŞÜ]/.test(s) ? 'tr' : 'en');

function isMostlyUpper(s: string): boolean {
  const letters = s.match(/\p{L}/gu);
  if (!letters || letters.length < 3) return false;
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase());
  return upper.length / letters.length > 0.8;
}

export interface LabelSplit {
  label: string;
  clause: string;
  body: string;
  bodyStart: number;
}

/** Separates a leading clause number ("MADDE 7 -", "Article 7.", "5.2.", "(b)") from the text. */
export function splitLabel(text: string, profile: Profile = defaultProfile): LabelSplit {
  const lead = text.length - text.trimStart().length;
  const t = text.slice(lead);
  const take = (m: RegExpMatchArray, clause: string, label = m[0].trim()): LabelSplit => {
    const bodyStart = lead + m[0].length;
    return { label: label.replace(/\s*[-–—:]$/u, ''), clause, body: text.slice(bodyStart), bodyStart };
  };

  let m = t.match(matchers(profile).article);
  if (m) {
    const rest = t.slice(m[0].length);
    // "Madde 7 uyarınca ..." / "Article 7 provides ..." is a sentence, not a heading:
    // require a separator, or a short or upper-case remainder.
    if (m[3] || rest.length === 0 || isMostlyUpper(rest) || rest.length < 60) {
      return take(m, m[2], `${m[1]} ${m[2]}`);
    }
  }
  if ((m = t.match(DOTTED_RE))) return take(m, m[1]);
  if ((m = t.match(SIMPLE_RE))) return take(m, m[1]);
  if ((m = t.match(PAREN_RE))) return take(m, m[1]);
  if ((m = t.match(LETTER_RE))) return take(m, m[1]);
  if ((m = t.match(BULLET_RE))) return take(m, '', '•');
  return { label: '', clause: '', body: text, bodyStart: 0 };
}

/** Normalised clause id for a generated list label like "5.2." or "(b)" */
export function clauseOf(label: string, profile?: Profile): string {
  return splitLabel(`${label} x`, profile).clause;
}

export function isArticleLabel(label: string, profile: Profile = defaultProfile): boolean {
  return matchers(profile).articleStart.test(label);
}

/** Typographic normalisation that PDF/DOCX round-trips routinely introduce. */
export function canon(s: string): string {
  return s
    .replace(/[  -​  　]/g, ' ')
    .replace(/[‘’‚‛´`]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...');
}

export function blockKey(body: string, opts: CompareOptions): string {
  let s = canon(body.normalize('NFC'));
  if (opts.ignorePunctuation) s = s.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (opts.ignoreCase) s = s.toLocaleLowerCase('tr');
  return s;
}

export interface Token {
  t: string;
  s: number;
  e: number;
  /** w = word or number, s = space, p = punctuation */
  k: 'w' | 's' | 'p';
}

// Words keep internal apostrophes, dots and commas so "Müşteri'nin", "1.250.000,00" and "e-mail" stay whole.
const TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:['’.,/\-][\p{L}\p{M}\p{N}]+)*|\s+|[^\s\p{L}\p{M}\p{N}]/gu;

export function tokenize(text: string, offset = 0): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const t = m[0];
    const s = (m.index ?? 0) + offset;
    const k = /^\s/.test(t) ? 's' : /^[\p{L}\p{M}\p{N}]/u.test(t) ? 'w' : 'p';
    out.push({ t, s, e: s + t.length, k });
  }
  return out;
}

export function tokenKey(tok: Token, opts: CompareOptions): string {
  if (tok.k === 's') return ' ';
  const c = canon(tok.t);
  return opts.ignoreCase ? c.toLocaleLowerCase('tr') : c;
}

/** Lower-cased word list used for similarity scoring */
export function words(text: string): string[] {
  return canon(text).toLocaleLowerCase('tr').match(/[\p{L}\p{M}\p{N}]+(?:[.,'][\p{N}\p{L}]+)*/gu) ?? [];
}

export interface Bag {
  map: Map<string, number>;
  n: number;
}

export function bag(text: string): Bag {
  const map = new Map<string, number>();
  const ws = words(text);
  for (const w of ws) map.set(w, (map.get(w) ?? 0) + 1);
  return { map, n: ws.length };
}

/** Dice coefficient over word multisets, 0..1 */
export function similarity(a: Bag, b: Bag): number {
  if (a.n === 0 && b.n === 0) return 1;
  if (a.n === 0 || b.n === 0) return 0;
  const [small, big] = a.map.size < b.map.size ? [a, b] : [b, a];
  let common = 0;
  for (const [w, c] of small.map) {
    const o = big.map.get(w);
    if (o) common += Math.min(c, o);
  }
  return (2 * common) / (a.n + b.n);
}

/**
 * "ÜCRET VE ÖDEME" -> "Ücret ve Ödeme", "PAYMENT TERMS" -> "Payment Terms"; mixed case is kept.
 * Pass the document language so "TANIMLAR" becomes "Tanımlar" (Turkish dotless i), not "Tanimlar".
 */
export function titleCase(s: string, profile: Profile = defaultProfile, lang?: string): string {
  const t = s.trim().replace(/[.:]$/u, '');
  if (!isMostlyUpper(t)) return t;
  const loc = caseLocale(t, lang);
  const small = new Set(profile.smallWords);
  return t
    .toLocaleLowerCase(loc)
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toLocaleUpperCase(loc) + w.slice(1)))
    .join('');
}

export function looksLikeHeading(body: string, label: string, profile: Profile = defaultProfile): boolean {
  const b = body.trim();
  const article = isArticleLabel(label, profile);
  if (!b) return article;
  if (b.length > 110 || /[.;,]$/u.test(b)) return false;
  if (isMostlyUpper(b)) return true;
  return article && b.length < 70;
}

export function shorten(s: string, max = 90): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > max * 0.6 ? sp : max).trimEnd()}...`;
}

const STOPWORDS: Record<string, string[]> = {
  tr: ['ve', 'ile', 'bir', 'bu', 'için', 'olarak', 'işbu', 'veya', 'her', 'olan', 'da', 'de', 'ise', 'gibi', 'kadar', 'hâlinde', 'halinde'],
  en: ['the', 'and', 'of', 'to', 'shall', 'this', 'any', 'by', 'or', 'in', 'with', 'is', 'be', 'for', 'that', 'which', 'on'],
};

/**
 * Rough language guess for a run of text, by stop-word frequency. Letters such as
 * "ş" are deliberately ignored: English contract text is full of Turkish party names.
 */
export function guessLang(text: string): string {
  const counts = new Map<string, number>();
  for (const w of text.toLocaleLowerCase('tr').match(/\p{L}+/gu) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best = '';
  let bestScore = 0;
  let total = 0;
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const score = list.reduce((n, w) => n + (counts.get(w) ?? 0), 0);
    total += score;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return total && bestScore / total > 0.65 ? best : '';
}
