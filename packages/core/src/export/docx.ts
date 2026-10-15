import type { Messages } from '../locales/en';
import { redlineBlock, redlineSpans } from '../render';
import type { Comparison } from '../types';

/**
 * Builds a Word file in which every difference is a real tracked change
 * (insertion or deletion), so reviewers can accept or reject them in Word.
 * Word's move markup is not produced: moves appear as a deletion at the old
 * place and an insertion at the new one.
 */
export async function toTrackedDocx(cmp: Comparison, m: Messages, opts: { author?: string; date?: Date } = {}): Promise<ArrayBuffer> {
  const { Document, Packer, Paragraph, TextRun, InsertedTextRun, DeletedTextRun, HeadingLevel, AlignmentType } = await import('docx');
  const author = opts.author ?? m.report.author;
  const date = (opts.date ?? new Date()).toISOString();
  let id = 1;
  const ins = (text: string) => new InsertedTextRun({ text, id: id++, author, date });
  const del = (text: string) => new DeletedTextRun({ text, id: id++, author, date });

  const children = cmp.ops.map((op) => {
    const { block } = redlineBlock(cmp, op);
    const runs = [];
    if (block.label) {
      const label = `${block.label} `;
      runs.push(op.t === 'ins' || op.t === 'movdst' ? ins(label) : op.t === 'del' || op.t === 'movsrc' ? del(label) : new TextRun(label));
    }
    for (const s of redlineSpans(cmp, op)) {
      if (s.k === 'eq') runs.push(new TextRun(s.text));
      else if (s.k === 'ins' || s.k === 'mdst') runs.push(ins(s.text));
      else runs.push(del(s.text));
    }
    return new Paragraph({
      children: runs,
      heading: block.kind === 'heading' ? (block.level <= 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2) : undefined,
      alignment: block.align === 'center' ? AlignmentType.CENTER : undefined,
      spacing: { after: 120 },
    });
  });

  const doc = new Document({
    creator: author,
    title: `${cmp.left.name} → ${cmp.right.name}`,
    features: { trackRevisions: true },
    sections: [{ children }],
  });
  // ArrayBuffer works in browsers, workers and Node alike.
  return Packer.toArrayBuffer(doc);
}
