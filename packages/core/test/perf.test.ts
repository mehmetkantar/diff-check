import { describe, expect, it } from 'vitest';
import { compareFiles } from '../src';

// ~250 pages of text: 120 articles x 15 paragraphs, with edits, deletions, insertions and moved articles.
function contract(seed: number, revise: boolean): string {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const vocab = 'taraflar sözleşme yükümlülük bedel süre fesih bildirim gizli bilgi teslim kabul ödeme fatura gün ay yıl hizmet yazılım bakım destek ceza'.split(' ');
  const sentence = (n: number) => Array.from({ length: n }, () => vocab[Math.floor(rnd() * vocab.length)]).join(' ');
  const articles: string[][] = [];
  for (let a = 1; a <= 120; a++) {
    const paras = [`MADDE ${a} - BAŞLIK ${a}`];
    for (let p = 1; p <= 15; p++) paras.push(`${a}.${p}. ${sentence(28)} ${a * 100 + p} TL.`);
    articles.push(paras);
  }
  if (revise) {
    for (let a = 0; a < articles.length; a += 7) articles[a][3] = articles[a][3].replace(/\d+ TL/, '999 TL');
    for (let a = 2; a < articles.length; a += 11) articles[a].splice(5, 1);
    for (let a = 4; a < articles.length; a += 13) articles[a].push(`${a + 1}.99. ${sentence(20)}`);
    const moved = articles.splice(10, 1)[0];
    articles.splice(80, 0, moved);
  }
  return articles.map((p) => p.join('\n\n')).join('\n\n');
}

describe('performance', () => {
  it('compares ~1,900 paragraphs quickly', async () => {
    const enc = (s: string, name: string) => ({ name, bytes: new TextEncoder().encode(s) });
    const t0 = performance.now();
    const cmp = await compareFiles(enc(contract(7, false), 'a.txt'), enc(contract(7, true), 'b.txt'));
    const ms = performance.now() - t0;
    console.log(`blocks ${cmp.left.blocks.length}/${cmp.right.blocks.length}, changes ${cmp.changes.length}, moves ${cmp.stats.move}, ${ms.toFixed(0)} ms`);
    // Exactly the one relocated article, reported once for all of its paragraphs; similar
    // vocabulary elsewhere must not produce false moves.
    expect(cmp.stats.move).toBe(1);
    expect(cmp.changes.find((c) => c.type === 'move')?.r.length).toBe(16);
    expect(ms).toBeLessThan(3000);
  });
});
