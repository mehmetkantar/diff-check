import { describe, expect, it } from 'vitest';
import {
  compareDocs, compareFiles, describeChange, en, english, mergeProfiles, parseDocument, registerParser, splitLabel, turkish, type DocModel, type Profile,
} from '../src';

const text = (name: string, s: string) => ({ name, bytes: new TextEncoder().encode(s) });

describe('profiles', () => {
  it('recognises article words per profile', () => {
    expect(splitLabel('MADDE 7 - GİZLİLİK', turkish).clause).toBe('7');
    expect(splitLabel('Article 12. Termination', english).clause).toBe('12');
    expect(splitLabel('§ 5 Haftung', english).clause).toBe('5');
    // A sentence that merely starts with a reference is not a heading.
    expect(splitLabel('Madde 7 uyarınca taraflar, işbu sözleşmeden doğan bütün yükümlülüklerini eksiksiz olarak yerine getirmeyi kabul ve taahhüt ederler.', turkish).label).toBe('');
  });

  it('lets a host add its own legal vocabulary', () => {
    const german: Profile = { articleWords: ['Artikel'], legalStems: ['haft'], legalWords: ['muss', 'darf'], smallWords: ['und'], negations: ['\\bnicht\\b'] };
    const p = mergeProfiles(english, german);
    expect(splitLabel('Artikel 3 Haftung', p).clause).toBe('3');
  });
});

describe('plain text parser', () => {
  it('compares two text drafts', async () => {
    const cmp = await compareFiles(
      text('a.md', '# Terms\n\n1. The fee is 100 EUR.\n\n2. Either party may terminate.\n'),
      text('b.md', '# Terms\n\n1. The fee is 120 EUR.\n\n2. Either party may terminate with notice.\n'),
    );
    expect(cmp.changes.map((c) => describeChange(c, en))).toEqual(['“100” changed to “120”', '“with notice” added']);
    expect(cmp.changes[0].flags).toContain('number');
  });
});

describe('custom parsers', () => {
  it('registerParser adds a format', async () => {
    registerParser({
      kind: 'csv-lines',
      extensions: ['lines'],
      detect: (_h, name) => name.endsWith('.lines'),
      parse: async (bytes, ctx): Promise<DocModel> => ({
        id: ctx.id,
        name: ctx.name,
        kind: 'csv-lines',
        size: bytes.byteLength,
        warnings: [],
        blocks: new TextDecoder().decode(bytes).split('\n').filter(Boolean).map((t, idx) => ({ idx, kind: 'para', level: 0, text: t, label: '', clause: '', body: t, bodyStart: 0 })),
      }),
    });
    const a = await parseDocument(text('x.lines', 'alpha beta gamma delta\nsecond line here today'));
    const b = await parseDocument(text('y.lines', 'second line here today\nalpha beta gamma delta'));
    expect(compareDocs(a, b).changes.map((c) => c.type)).toEqual(['move']);
  });
});

describe('heading titles', () => {
  it('uses Turkish casing for Turkish documents without Turkish letters in the heading', async () => {
    const cmp = await compareFiles(
      text('a.txt', 'MADDE 1 - TANIMLAR\n\n1.1. Bu sözleşmede geçen terimler ve ifadeler aşağıdaki anlamlara gelir.\n'),
      text('b.txt', 'MADDE 1 - TANIMLAR\n\n1.1. Bu sözleşmede geçen terimler ve ifadeler aşağıdaki şekilde tanımlanmıştır.\n'),
    );
    expect(cmp.locR[1].title).toBe('Tanımlar');
  });
});
