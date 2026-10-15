import type { OcrProvider } from '@redline/core';
import { createTesseractOcr } from '@redline/ocr';

/**
 * In-browser OCR for scanned PDFs. The worker, WebAssembly core and Turkish/English language data are
 * copied to ./ocr/ next to index.html at build time (see the predev/prebuild scripts), so recognition
 * runs on this machine and nothing is fetched from a CDN.
 *
 * Browsers do not start workers from file:// pages, so when the single-file build is opened straight
 * from disk OCR is switched off and scanned PDFs report that they need OCR. Served over http(s), the
 * single-file build uses the ocr/ folder placed next to it.
 */
export const ocr: OcrProvider | undefined =
  typeof location !== 'undefined' && location.protocol !== 'file:'
    ? createTesseractOcr({ assetsUrl: new URL('ocr/', document.baseURI).href, langs: ['tur', 'eng'] })
    : undefined;
