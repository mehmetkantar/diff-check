import { defaultProfile } from '../profile';
import { looksLikeHeading, splitLabel } from '../text';
import type { Block, DocModel } from '../types';
import type { ParseContext } from './registry';

/**
 * Plain text and Markdown: paragraphs are separated by blank lines; a single
 * line that starts with a clause number also starts a paragraph.
 */
export async function parseText(bytes: ArrayBuffer, ctx: ParseContext): Promise<DocModel> {
  const profile = ctx.profile ?? defaultProfile;
  const src = new TextDecoder('utf-8').decode(bytes).replace(/\r\n?/g, '\n');
  const paras: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) paras.push(cur.join(' ').replace(/\s+/g, ' ').trim());
    cur = [];
  };
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (cur.length && (/^#{1,6}\s/.test(line) || splitLabel(line, profile).label)) flush();
    cur.push(line);
    if (/^#{1,6}\s/.test(line)) flush();
  }
  flush();
  const blocks: Block[] = paras.filter(Boolean).map((p, idx) => {
    const md = p.match(/^(#{1,6})\s+(.*)$/);
    const text = md ? md[2] : p;
    const split = splitLabel(text, profile);
    const heading = !!md || looksLikeHeading(split.body, split.label, profile);
    return {
      idx,
      kind: heading ? 'heading' : 'para',
      level: md ? md[1].length : heading ? 2 : 0,
      text,
      label: split.label,
      clause: split.clause,
      body: split.body,
      bodyStart: split.bodyStart,
    };
  });
  return { id: ctx.id, name: ctx.name, kind: 'text', size: bytes.byteLength, blocks, warnings: [] };
}
