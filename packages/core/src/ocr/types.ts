/**
 * OCR is pluggable: the engine only needs words with positions. Bundled
 * providers: @redline/ocr (tesseract.js in the browser) and the CLI's
 * Tesseract/Poppler provider for servers. ABBYY, Azure Document Intelligence
 * containers or an internal service fit the same interface.
 */
export interface OcrPage {
  /** 1-based page number and total page count */
  pageNo: number;
  pageCount: number;
  /** Page size in PDF units (1/72 inch) */
  width: number;
  height: number;
  /** Renders the page to a canvas at `scale` (1 = 72 dpi). Browser only; undefined in Node. */
  render?: (scale: number) => Promise<HTMLCanvasElement | OffscreenCanvas>;
  /** The whole PDF, for engines that rasterise pages themselves (server side) */
  pdf: Uint8Array;
}

/** A recognised word, positioned in PDF units with a top-left origin. */
export interface OcrWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0-100 when the engine reports it */
  confidence?: number;
  /**
   * Id of the text line the word belongs to (unique per page), when the engine
   * reports layout. Strongly recommended: without it lines are rebuilt from
   * word boxes, which is less reliable around punctuation.
   */
  line?: number;
}

export interface OcrProvider {
  name: string;
  recognize(page: OcrPage, signal?: AbortSignal): Promise<OcrWord[]>;
  /** Releases workers or other resources */
  dispose?(): void | Promise<void>;
}

export type ParseProgress = { phase: 'read' } | { phase: 'ocr'; page: number; pages: number };
