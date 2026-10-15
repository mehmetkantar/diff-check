import type { Messages } from './locales/en';
import { shorten } from './text';
import type { Change, Edit, Loc, Subject } from './types';

const PUNCT_ONLY = /^[^\p{L}\p{N}]*$/u;
const quote = (s: string) => `“${shorten(s, 60)}”`;

/** "Clause 5.2" / "Madde 5.2", falling back to the heading or paragraph number. */
export function placeLabel(loc: Loc | undefined, m: Messages): string {
  if (!loc) return '';
  if (loc.clause) return m.clause(loc.clause);
  if (loc.title) return m.section(loc.title);
  return m.paragraph(loc.para);
}

export function editPhrase(e: Edit, m: Messages): string {
  if (PUNCT_ONLY.test(e.before) && PUNCT_ONLY.test(e.after)) {
    const p = e.before && e.after ? m.replaced(quote(e.before), quote(e.after)) : e.after ? m.addedText(quote(e.after)) : m.removedText(quote(e.before));
    return m.punctuation(p);
  }
  if (e.before && e.after) return m.replaced(quote(e.before), quote(e.after));
  if (e.after) return m.addedText(quote(e.after));
  return m.removedText(quote(e.before));
}

export function subjectName(s: Subject, m: Messages, inserted = false): string {
  switch (s.kind) {
    case 'heading':
      return m.subject.heading(s.name, s.article);
    case 'paras':
      return m.subject.paras(s.count);
    case 'row':
      return m.subject.row;
    default:
      return inserted ? m.subject.newPara : m.subject.para;
  }
}

/** One plain-language sentence for a change, in the given language. */
export function describeChange(c: Change, m: Messages): string {
  switch (c.type) {
    case 'ins':
      return m.inserted(subjectName(c.subject, m, true));
    case 'del':
      return m.deleted(subjectName(c.subject, m));
    case 'move':
      return m.moved(subjectName(c.subject, m), placeLabel(c.locL, m), placeLabel(c.locR, m));
    case 'renum':
      return m.renumbered(c.renum?.from || m.none, c.renum?.to || m.none);
    case 'mod': {
      if (!c.edits.length) return m.formatOnly;
      const first = editPhrase(c.edits[0], m);
      const lead = c.subject.kind === 'row' ? m.tableEdit(first) : first;
      return c.edits.length === 1 ? lead : lead + m.moreEdits(c.edits.length - 1);
    }
  }
}
