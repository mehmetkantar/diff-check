import { docxParser, pdfParser, textParser } from './builtin';
import { tagParallelColumns } from './columns';
import { ParseError } from './errors';
import type { OcrProvider, ParseProgress } from '../ocr/types';
import type { Profile } from '../profile';
import type { DocModel } from '../types';

export interface ParseContext {
  id: string;
  name: string;
  profile?: Profile;
  /** Recognises scanned pages that have no text layer */
  ocr?: OcrProvider;
  onProgress?: (p: ParseProgress) => void;
  signal?: AbortSignal;
}

/**
 * A document parser. Register more (ODT, HTML, OCR'd scans, plain text) with
 * `registerParser`; the first parser whose `detect` returns true wins.
 */
export interface DocumentParser {
  kind: string;
  /** File extensions handled, lower-case without the dot; used for file pickers */
  extensions: string[];
  detect(head: Uint8Array, name: string): boolean;
  parse(bytes: ArrayBuffer, ctx: ParseContext): Promise<DocModel>;
}

// Built-ins are plain data, not side-effect registrations, so tree-shaking cannot drop them.
const parsers: DocumentParser[] = [pdfParser, docxParser, textParser];

export function registerParser(p: DocumentParser, opts: { first?: boolean } = {}) {
  const at = parsers.findIndex((x) => x.kind === p.kind);
  if (at >= 0) parsers.splice(at, 1);
  if (opts.first) parsers.unshift(p);
  else parsers.push(p);
}

export const registeredParsers = (): readonly DocumentParser[] => parsers;

/** Extensions accepted by the registered parsers, e.g. ".docx,.pdf" for an <input accept>. */
export const acceptedExtensions = () => parsers.flatMap((p) => p.extensions.map((e) => `.${e}`)).join(',');

export type DocumentInput = Blob | ArrayBuffer | Uint8Array | { name: string; bytes: ArrayBuffer | Uint8Array };

let seq = 0;

async function toBytes(input: DocumentInput): Promise<{ bytes: ArrayBuffer; name: string }> {
  if (input instanceof ArrayBuffer) return { bytes: input, name: 'document' };
  if (input instanceof Uint8Array) return { bytes: input.slice().buffer as ArrayBuffer, name: 'document' };
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return { bytes: await input.arrayBuffer(), name: (input as File).name ?? 'document' };
  }
  const { name, bytes } = input as { name: string; bytes: ArrayBuffer | Uint8Array };
  return { name, bytes: bytes instanceof Uint8Array ? (bytes.slice().buffer as ArrayBuffer) : bytes };
}

export interface ParseOptions {
  /** Overrides the file name (also used for display) */
  name?: string;
  profile?: Profile;
  /** OCR engine for scanned PDFs without a text layer; without one they fail with 'pdf-no-text' */
  ocr?: OcrProvider;
  onProgress?: (p: ParseProgress) => void;
  signal?: AbortSignal;
}

/** Reads a DOCX or PDF (or any registered format) into the engine's document model. */
export async function parseDocument(input: DocumentInput, opts: ParseOptions = {}): Promise<DocModel> {
  const { bytes, name: detected } = await toBytes(input);
  const name = opts.name ?? detected;
  const head = new Uint8Array(bytes.slice(0, 8));
  const parser = parsers.find((p) => p.detect(head, name));
  if (!parser) {
    if (name.toLowerCase().endsWith('.doc')) throw new ParseError('legacy-doc');
    throw new ParseError('unsupported');
  }
  const doc = await parser.parse(bytes, { id: `d${++seq}`, name, profile: opts.profile, ocr: opts.ocr, onProgress: opts.onProgress, signal: opts.signal });
  return tagParallelColumns(doc);
}
