/**
 * Decides whether a difference looks like an OCR misreading rather than an edit.
 *
 * Weighted edit distance: substitutions between characters OCR engines
 * routinely confuse (1/l/I/|, 0/O/%, quote styles, Turkish diacritics) and
 * insertions/deletions of stray marks are "cheap"; anything else is
 * "expensive". A difference is OCR-like only when it can be explained with
 * cheap operations alone. Digit-to-digit substitutions are never cheap, so a
 * changed amount (24 -> 25) is always reported as a real change.
 */

const PAIRS = [
  '1l', '1I', '1|', '1!', 'lI', 'l|', 'I|', 'il', 'i1', 'iI', 'i!', 'l!', 'I!',
  '0O', '0o', '0%', 'o%', 'O%', '0Q', 'OQ', '0D', 'OD',
  '5S', '5s', '8B', '2Z', '6b', '6G', '9g', '9q', 'ce', 'co', 'ao', 'nu', 'rn', 'vy', 'hb',
  'uü', 'oö', 'iı', 'sş', 'gğ', 'cç', 'UÜ', 'OÖ', 'Iİ', 'SŞ', 'GĞ', 'CÇ', 'ıl', 'ı1', 'İI',
  'aâ', 'iî', 'uû', 'AÂ',
];
const CONFUSABLE = new Set(PAIRS.flatMap((p) => [p, p[1] + p[0]]));

// Marks OCR adds or drops: punctuation, quotes, vertical strokes, specks.
const NOISE = new Set([...`'"“”‘’\`´.,:;!?*+°^~_-|%/\\ Il`]);
const QUOTES = new Set([...`'"“”‘’\`´`]);

/** Multi-character confusions are folded first: "rn" reads as "m", "cl" as "d", "vv" as "w". */
const fold = (s: string) => s.normalize('NFC').replace(/rn/g, 'm').replace(/cl/g, 'd').replace(/vv/g, 'w');

const CHEAP = 1;
const EXPENSIVE = 1000;

function subCost(a: string, b: string): number {
  if (a === b) return 0;
  if (CONFUSABLE.has(a + b)) return CHEAP;
  if ((QUOTES.has(a) && QUOTES.has(b)) || (NOISE.has(a) && NOISE.has(b))) return CHEAP;
  return EXPENSIVE;
}
const indelCost = (c: string) => (NOISE.has(c) ? CHEAP : EXPENSIVE);

export function ocrLikely(before: string, after: string): boolean {
  const a = [...fold(before)];
  const b = [...fold(after)];
  if (a.join('') === b.join('')) return true;
  // A long rewrite is an edit even if every step were cheap.
  const budget = Math.max(2, Math.ceil(Math.max(a.length, b.length) * 0.35));
  if (Math.abs(a.length - b.length) > budget) return false;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  prev[0] = 0;
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + indelCost(b[j - 1]);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = prev[0] + indelCost(a[i - 1]);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j - 1] + subCost(a[i - 1], b[j - 1]), prev[j] + indelCost(a[i - 1]), cur[j - 1] + indelCost(b[j - 1]));
    }
    [prev, cur] = [cur, prev];
  }
  const cost = prev[b.length];
  return cost < EXPENSIVE && cost <= budget;
}
