/**
 * Server-side OCR with the Tesseract and Poppler command-line tools (Node only).
 * Used by the `redline --ocr` CLI; also usable from a host's own Node service.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OcrPage, OcrProvider, OcrWord } from './types';

function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', (e) => reject(new Error(`${cmd} could not be started (${e.message}). Is it installed and on PATH?`)));
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} exited with ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`))));
    child.stdin.end();
  });
}

export interface TesseractCliOptions {
  /** Tesseract language codes, default ['tur', 'eng'] */
  langs?: string[];
  dpi?: number;
  tesseract?: string;
  pdftoppm?: string;
}

export function createTesseractCliOcr(opts: TesseractCliOptions = {}): OcrProvider {
  const dpi = opts.dpi ?? 300;
  const langs = (opts.langs ?? ['tur', 'eng']).join('+');
  let dir: Promise<string> | null = null;
  let pdfPath: string | null = null;
  let pdfRef: Uint8Array | null = null;

  return {
    name: 'tesseract-cli',
    async recognize(page: OcrPage): Promise<OcrWord[]> {
      dir ??= mkdtemp(join(tmpdir(), 'redline-ocr-'));
      if (pdfRef !== page.pdf) {
        pdfPath = join(await dir, 'input.pdf');
        await writeFile(pdfPath, page.pdf);
        pdfRef = page.pdf;
      }
      const n = String(page.pageNo);
      // pdftoppm cannot write to stdout on every platform, so the page image goes through a temp file.
      const base = join(await dir, `page-${n}`);
      await run(opts.pdftoppm ?? 'pdftoppm', ['-f', n, '-l', n, '-r', String(dpi), '-gray', '-png', '-singlefile', pdfPath!, base]);
      const tsv = (await run(opts.tesseract ?? 'tesseract', [`${base}.png`, 'stdout', '-l', langs, '--psm', '3', 'tsv'])).toString('utf8');
      await rm(`${base}.png`, { force: true });
      const k = 72 / dpi;
      const words: OcrWord[] = [];
      for (const line of tsv.split('\n').slice(1)) {
        const c = line.split('\t');
        if (c[0] !== '5' || !c[11]?.trim()) continue;
        // TSV columns: level page block par line word left top width height conf text
        words.push({ text: c[11], x: +c[6] * k, y: +c[7] * k, w: +c[8] * k, h: +c[9] * k, confidence: +c[10], line: +c[2] * 1e6 + +c[3] * 1e3 + +c[4] });
      }
      return words;
    },
    async dispose() {
      if (dir) await rm(await dir, { recursive: true, force: true });
      dir = null;
    },
  };
}
