/**
 * @redline/core: compare two versions of a DOCX or PDF document.
 *
 *   const a = await parseDocument(fileA);
 *   const b = await parseDocument(fileB);
 *   const result = compareDocs(a, b, { ignoreCase: true });
 *   result.changes.forEach((c) => console.log(describeChange(c, en)));
 *
 * Runs in browsers, Web Workers and Node. No network access, no telemetry.
 */
import { compareDocs } from './compare';
import { parseDocument, type DocumentInput, type ParseOptions } from './parsers';
import type { CompareOptions, Comparison } from './types';

export * from './types';
export { changeKey, compareDocs, rowKey } from './compare';
export { alignBlocks } from './align';
export { inlineDiff, editsOf } from './inline';
export { flagsOf } from './flags';
export { describeChange, editPhrase, placeLabel, subjectName } from './describe';
export { sideSpans, redlineSpans, redlineBlock, moveNote } from './render';
export type { Span, SpanKind, Side } from './render';
export { splitLabel, titleCase, tokenize, similarity, bag, canon, guessLang } from './text';
export { defaultProfile, english, turkish, mergeProfiles } from './profile';
export type { Profile } from './profile';
export type { OcrPage, OcrProvider, OcrWord, ParseProgress } from './ocr/types';
export { en, tr, locales, resolveLocale } from './locales';
export type { Messages } from './locales';
export { toJSON, toCSV } from './export/data';
export { toHTMLReport } from './export/html';
export { toTrackedDocx } from './export/docx';
export {
  acceptedExtensions, configurePdf, docxParser, pdfParser, textParser, getPdfDocument, isParseError, parseDocument, ParseError, registerParser, registeredParsers,
  releasePdfDocument, renderPdfPage,
} from './parsers';
export type { DocumentInput, DocumentParser, ParseContext, ParseErrorCode, ParseOptions, PdfConfig } from './parsers';

/** Parse both inputs and compare them in one call. */
export async function compareFiles(
  original: DocumentInput,
  revised: DocumentInput,
  options: Partial<CompareOptions> & Pick<ParseOptions, 'profile' | 'ocr' | 'signal'> = {},
): Promise<Comparison> {
  const parse = (input: DocumentInput) => parseDocument(input, { profile: options.profile, ocr: options.ocr, signal: options.signal });
  // Sequential: OCR engines are usually single-worker, and progress reads better per file.
  const a = await parse(original);
  const b = await parse(revised);
  return compareDocs(a, b, options);
}
