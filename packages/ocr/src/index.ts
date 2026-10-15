/**
 * @redline/ocr: an OcrProvider for @redline/core built on tesseract.js.
 *
 * Everything is self-hosted. The worker script, the WebAssembly core and the
 * language data are served from your own origin (copy them with
 * `npx redline-ocr-assets public/ocr`), so scans never leave the browser and
 * no CDN is contacted.
 *
 *   const ocr = createTesseractOcr({ assetsUrl: '/ocr' });
 *   <RedlineViewer original={a} revised={b} ocr={ocr} />
 */
import type { OcrPage, OcrProvider, OcrWord } from '@redline/core';
import { createWorker, OEM, type Worker } from 'tesseract.js';

export interface TesseractOcrOptions {
  /** URL of the folder produced by `redline-ocr-assets` (worker.min.js, core/, lang/) */
  assetsUrl: string;
  /** Tesseract language codes, in priority order. Default: Turkish and English. */
  langs?: string[];
  /** Rendering resolution for recognition. 300 dpi is the usual sweet spot; lower is faster. */
  dpi?: number;
}

const abortError = () => new DOMException('OCR aborted', 'AbortError');

/** Resolves the assets folder to an absolute URL; the worker loads its files with importScripts. */
function absolute(url: string): string {
  const base = typeof document !== 'undefined' ? document.baseURI : (globalThis as { location?: { href: string } }).location?.href;
  return new URL(url.replace(/\/?$/, '/'), base).href.replace(/\/$/, '');
}

export function createTesseractOcr(opts: TesseractOcrOptions): OcrProvider {
  const langs = opts.langs?.length ? opts.langs : ['tur', 'eng'];
  const dpi = opts.dpi ?? 300;
  let worker: Promise<Worker> | null = null;

  const getWorker = () => {
    worker ??= (async () => {
      const assets = absolute(opts.assetsUrl);
      const w = await createWorker(langs, OEM.LSTM_ONLY, {
        workerPath: `${assets}/worker.min.js`,
        corePath: `${assets}/core`,
        langPath: `${assets}/lang`,
        gzip: true,
        // Load the worker from its own URL rather than a blob: so a plain `worker-src 'self'` CSP is enough.
        workerBlobURL: false,
        // Language data is cached in IndexedDB after the first load, on this machine only.
        cacheMethod: 'write',
        logger: () => {},
        errorHandler: () => {},
      });
      await w.setParameters({ user_defined_dpi: String(dpi) });
      return w;
    })();
    // A failed start must not poison later attempts.
    worker.catch(() => {
      worker = null;
    });
    return worker;
  };

  const reset = async () => {
    const w = worker;
    worker = null;
    if (w) await (await w.catch(() => null))?.terminate();
  };

  return {
    name: `tesseract.js (${langs.join('+')})`,

    async recognize(page: OcrPage, signal?: AbortSignal): Promise<OcrWord[]> {
      if (!page.render) {
        throw new Error('@redline/ocr runs in the browser only. On a server use the CLI (`redline a.pdf b.pdf --ocr`) or another OcrProvider.');
      }
      if (signal?.aborted) throw abortError();
      const scale = dpi / 72;
      const [canvas, w] = await Promise.all([page.render(scale), getWorker()]);
      if (signal?.aborted) throw abortError();

      // A running recognition cannot be interrupted, so abort ends the worker; the next call starts a fresh one.
      const onAbort = () => void reset();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const { data } = await w.recognize(canvas, {}, { blocks: true, text: false });
        if (signal?.aborted) throw abortError();
        const words: OcrWord[] = [];
        // One id per text line, so the engine gives all its words one baseline and size
        // (a hyphen's own box is only a few pixels tall and would otherwise start a new line).
        let lineId = 0;
        for (const block of data.blocks ?? []) {
          for (const para of block.paragraphs) {
            for (const line of para.lines) {
              lineId++;
              for (const word of line.words) {
                const text = word.text.trim();
                if (!text) continue;
                const { x0, y0, x1, y1 } = word.bbox;
                words.push({
                  text,
                  x: x0 / scale,
                  y: y0 / scale,
                  w: (x1 - x0) / scale,
                  h: (y1 - y0) / scale,
                  confidence: word.confidence,
                  line: lineId,
                });
              }
            }
          }
        }
        return words;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },

    dispose: reset,
  };
}
