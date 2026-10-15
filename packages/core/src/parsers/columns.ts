import { guessLang } from '../text';
import type { DocModel } from '../types';

/**
 * Parsers mark blocks that sit in a two-column parallel layout with `col` and
 * `group`. If the two columns are in different languages the document is
 * bilingual: every block gets its column's language. If they are not, the
 * columns were just layout, and the parallel markers are removed.
 */
export function tagParallelColumns(doc: DocModel): DocModel {
  const cols: [string, string] = ['', ''];
  for (const b of doc.blocks) if (b.col !== undefined) cols[b.col] += ` ${b.body}`;
  if (!cols[0] || !cols[1]) return strip(doc);
  const langs: [string, string] = [guessLang(cols[0]), guessLang(cols[1])];
  if (!langs[0] || !langs[1] || langs[0] === langs[1]) return strip(doc);
  for (const b of doc.blocks) if (b.col !== undefined) b.lang = langs[b.col];
  return { ...doc, langs };
}

function strip(doc: DocModel): DocModel {
  for (const b of doc.blocks) {
    delete b.col;
    delete b.group;
  }
  return doc;
}
