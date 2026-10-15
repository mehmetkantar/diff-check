export type ParseErrorCode =
  | 'unsupported'
  | 'legacy-doc'
  | 'docx-invalid'
  | 'docx-empty'
  | 'pdf-password'
  | 'pdf-invalid'
  | 'pdf-no-text'
  | 'ocr-failed';

/** A parse failure with a stable code; the UI maps codes to localized messages. */
export class ParseError extends Error {
  readonly code: ParseErrorCode;
  constructor(code: ParseErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ParseError';
    this.code = code;
  }
}

export const isParseError = (e: unknown): e is ParseError => e instanceof Error && (e as ParseError).name === 'ParseError';
