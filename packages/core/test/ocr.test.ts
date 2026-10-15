import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareDocs, describeChange, parseDocument, tr } from '../src';
import { ocrLikely } from '../src/ocr/likely';
import { createTesseractCliOcr } from '../src/ocr/tesseract-cli';

const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(join(__dirname, '../../../fixtures', name))) });
const hasTools = (() => {
  try {
    execFileSync('tesseract', ['--version'], { stdio: 'ignore' });
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('ocrLikely', () => {
  it.each([
    ['Ek-1’de', 'Ek-I1?de'],
    ['1', '|'],
    ['+', '*'],
    ['%', ''],
    ['Yüklenici’ye', 'Yüklenici”ye'],
    ['%24', '“024'],
    ['%15’ini', '“015\'ini'],
    ['modern', 'rnodern'],
    ['Şirket', 'Sirket'],
  ])('treats %s -> %s as a scanning mistake', (a, b) => expect(ocrLikely(a, b)).toBe(true));

  it.each([
    ['24', '25'],
    ['%24', '%25'],
    ['1.250.000,00', '1.400.000,00'],
    ['30 (otuz)', '45 (kırk beş)'],
    ['makul çabayı gösterecektir', 'yükümlüdür'],
    ['255', '199'],
    ['', 'yeni madde'],
  ])('treats %s -> %s as a real edit', (a, b) => expect(ocrLikely(a, b)).toBe(false));
});

describe('searchable scan (OCR text layer)', async () => {
  const scan = await parseDocument(fixture('service-agreement-v2-ocr.pdf'));

  it('is recognised as OCR output', () => {
    expect(scan.ocr).toBe('layer');
    expect(scan.warnings).toContain('ocr-text');
  });

  it('labels scanner noise against the same text', async () => {
    const cmp = compareDocs(await parseDocument(fixture('service-agreement-v2.docx')), scan);
    const real = cmp.changes.filter((c) => !c.flags.includes('ocr'));
    if (real.length) console.log(real.map((c) => describeChange(c, tr)));
    expect(cmp.stats.ocr).toBeGreaterThanOrEqual(cmp.changes.length - 2);
  });

  it('keeps real edits unlabelled', async () => {
    const cmp = compareDocs(await parseDocument(fixture('service-agreement-v1.docx')), scan);
    const term = cmp.changes.find((c) => c.edits.some((e) => e.before === '12 (on iki)' && e.after === '24 (yirmi dört)'));
    expect(term?.flags).toContain('number');
    expect(term?.flags).not.toContain('ocr');
    expect(cmp.stats.move).toBe(2);
  });
});

describe.skipIf(!hasTools)('image-only scan with server OCR (tesseract CLI)', () => {
  it('fails clearly without an OCR provider', async () => {
    await expect(parseDocument(fixture('service-agreement-v2-scanned.pdf'))).rejects.toMatchObject({ code: 'pdf-no-text' });
  });

  it('reads the scan and finds the real changes', async () => {
    const ocr = createTesseractCliOcr();
    const progress: number[] = [];
    const scan = await parseDocument(fixture('service-agreement-v2-scanned.pdf'), { ocr, onProgress: (p) => p.phase === 'ocr' && progress.push(p.page) });
    await ocr.dispose?.();
    expect(scan.ocr).toBe('engine');
    expect(progress).toEqual([1, 2, 3]);
    const cmp = compareDocs(await parseDocument(fixture('service-agreement-v1.docx')), scan);
    console.log(`engine OCR: ${cmp.changes.length} changes, ${cmp.stats.ocr} labelled OCR, ${cmp.stats.move} moves`);
    expect(cmp.stats.move).toBe(2);
    expect(cmp.changes.some((c) => c.type === 'del' && c.excerpt.includes('sebep göstermeksizin'))).toBe(true);
  }, 120_000);

  it('adds only a handful of differences to an identical text, mostly labelled', async () => {
    const ocr = createTesseractCliOcr();
    const scan = await parseDocument(fixture('service-agreement-v2-scanned.pdf'), { ocr });
    await ocr.dispose?.();
    const cmp = compareDocs(await parseDocument(fixture('service-agreement-v2.docx')), scan);
    console.log(cmp.changes.map((c) => `${c.flags.join(',')} ${describeChange(c, tr)}`).join('\n'));
    expect(cmp.changes.length).toBeLessThanOrEqual(10);
    expect(cmp.stats.ocr).toBeGreaterThanOrEqual(cmp.changes.length - 2);
  }, 120_000);
});
