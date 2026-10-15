import { describeChange, placeLabel } from '../describe';
import type { Messages } from '../locales/en';
import type { Comparison } from '../types';

/** Plain, JSON-safe summary of a comparison: for APIs, audit logs and integrations. */
export function toJSON(cmp: Comparison, m?: Messages) {
  return {
    left: { name: cmp.left.name, kind: cmp.left.kind, pages: cmp.left.pageCount, langs: cmp.left.langs },
    right: { name: cmp.right.name, kind: cmp.right.kind, pages: cmp.right.pageCount, langs: cmp.right.langs },
    options: { ...cmp.options, profile: undefined },
    stats: cmp.stats,
    changes: cmp.changes.map((c) => ({
      n: c.n,
      type: c.type,
      description: m ? describeChange(c, m) : undefined,
      original: c.locL ? { ...c.locL, label: m ? placeLabel(c.locL, m) : undefined } : null,
      revised: c.locR ? { ...c.locR, label: m ? placeLabel(c.locR, m) : undefined } : null,
      edits: c.edits,
      flags: c.flags,
      lang: c.lang,
      moveEdited: c.moveEdited,
      excerpt: c.excerpt,
    })),
  };
}

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV change list. Uses ";" and a BOM so Excel opens it correctly in locales
 * where "," is the decimal separator (Turkish, German, French...).
 */
export function toCSV(cmp: Comparison, m: Messages): string {
  const rows = [m.csv.headers];
  for (const c of cmp.changes) {
    rows.push([
      String(c.n),
      m.type[c.type],
      placeLabel(c.locL, m),
      placeLabel(c.locR, m),
      c.locL?.page ? String(c.locL.page) : '',
      c.locR?.page ? String(c.locR.page) : '',
      describeChange(c, m),
      c.edits.map((e) => e.before).filter(Boolean).join(' | '),
      c.edits.map((e) => e.after).filter(Boolean).join(' | '),
      c.flags.map((f) => m.flag[f]).join(', '),
      c.lang ? c.lang.toUpperCase() : '',
    ]);
  }
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}
