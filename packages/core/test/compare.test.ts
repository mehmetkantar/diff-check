import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareDocs, describeChange, en, parseDocument, toCSV, toHTMLReport, toTrackedDocx, tr, type Comparison, type DocModel } from '../src';

const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(join(__dirname, '../../../fixtures', name))) });
const load = (name: string) => parseDocument(fixture(name));
const dump = (c: Comparison) => c.changes.map((x) => `${x.n} ${x.type} ${x.locL?.clause ?? '-'} -> ${x.locR?.clause ?? '-'} | ${describeChange(x, en)} [${x.flags.join(',')}]`);

describe('service agreement (DOCX)', async () => {
  const a = await load('service-agreement-v1.docx');
  const b = await load('service-agreement-v2.docx');
  const cmp = compareDocs(a, b);

  it('resolves Word auto-numbered list items', () => {
    expect(a.blocks.filter((x) => x.label.startsWith('(')).map((x) => x.label)).toEqual(['(a)', '(b)', '(c)']);
  });

  it('reports the substantive edits', () => {
    const lines = dump(cmp);
    expect(lines.some((l) => l.includes('“Confidentiality”') || l.includes('“Gizlilik” clause moved from Clause 7 to Clause 9'))).toBe(true);
    expect(cmp.changes.some((c) => c.type === 'del' && c.excerpt.includes('sebep göstermeksizin'))).toBe(true);
    expect(cmp.changes.some((c) => c.type === 'mod' && c.edits.some((e) => e.before === '12 (on iki)' && e.after === '24 (yirmi dört)'))).toBe(true);
    expect(cmp.changes.some((c) => c.type === 'move' && c.locL?.clause === '6.3' && c.locR?.clause === '3.2')).toBe(true);
  });

  it('hides clauses that were only renumbered', () => {
    expect(cmp.changes.some((c) => c.excerpt.startsWith('Yazılım’a ilişkin tüm fikri'))).toBe(false);
    expect(cmp.stats.renumHidden).toBeGreaterThan(5);
  });

  it('describes changes in Turkish too', () => {
    expect(cmp.changes.map((c) => describeChange(c, tr))).toContain('“12 (on iki)” yerine “24 (yirmi dört)”');
  });

  it('exports CSV, HTML and tracked-changes DOCX', async () => {
    expect(toCSV(cmp, en).split('\r\n').length).toBe(cmp.changes.length + 2);
    expect(toHTMLReport(cmp, tr)).toContain('Karşılaştırma raporu');
    const bytes = await toTrackedDocx(cmp, en);
    const back = await parseDocument({ name: 'redline.docx', bytes });
    expect(back.warnings).toContain('tracked-changes');
  });
});

describe('PDF parsing', async () => {
  const docx = await load('service-agreement-v2.docx');
  const pdf = await load('service-agreement-v2.pdf');

  it('extracts the same paragraphs as the Word original', () => {
    const cmp = compareDocs(docx, pdf);
    if (cmp.changes.length) console.log(dump(cmp).join('\n'));
    expect(cmp.changes.length).toBeLessThanOrEqual(1);
  });

  it('drops running headers and page numbers', () => {
    expect(pdf.blocks.some((b) => /^Sayfa \d+ \/ \d+$/.test(b.text))).toBe(false);
    expect(pdf.blocks.some((b) => b.text.includes('Hizmet Sözleşmesi, Taslak'))).toBe(false);
  });

  it('compares PDF against PDF like DOCX against DOCX', async () => {
    const a = await load('service-agreement-v1.pdf');
    const viaPdf = compareDocs(a, pdf);
    const viaDocx = compareDocs(await load('service-agreement-v1.docx'), docx);
    expect(viaPdf.stats.move).toBe(viaDocx.stats.move);
    expect(Math.abs(viaPdf.stats.total - viaDocx.stats.total)).toBeLessThanOrEqual(1);
  });
});

describe('bilingual NDA (Turkish | English columns)', async () => {
  for (const ext of ['docx', 'pdf']) {
    describe(ext, async () => {
      const a: DocModel = await load(`bilingual-nda-v1.${ext}`);
      const b: DocModel = await load(`bilingual-nda-v2.${ext}`);
      const cmp = compareDocs(a, b);

      it('detects the two languages', () => {
        expect(b.langs).toEqual(['tr', 'en']);
        expect(b.blocks.filter((x) => x.lang === 'en').length).toBeGreaterThan(8);
      });

      it('flags edits made in only one language', () => {
        console.log(`--- ${ext}\n${dump(cmp).join('\n')}`);
        const unmirrored = cmp.changes.filter((c) => c.flags.includes('unmirrored'));
        expect(unmirrored.some((c) => c.lang === 'tr' && c.edits.some((e) => e.after.includes('750.000')))).toBe(true);
        expect(unmirrored.some((c) => c.lang === 'en' && c.edits.some((e) => e.after.includes('10 (ten)')))).toBe(true);
        // Mirrored edits (term 2 -> 3 years) are not flagged.
        const term = cmp.changes.filter((c) => c.edits.some((e) => e.after.includes('3 (')));
        expect(term.length).toBe(2);
        expect(term.every((c) => !c.flags.includes('unmirrored'))).toBe(true);
      });

      it('sees the Exceptions article move', () => {
        expect(cmp.changes.some((c) => c.type === 'move' && c.subject.kind === 'heading')).toBe(true);
      });
    });
  }
});
