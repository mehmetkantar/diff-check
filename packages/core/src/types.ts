import type { Profile } from './profile';

export type FileKind = 'docx' | 'pdf' | (string & {});

/** A word's position on a PDF page (top-left origin, PDF units at scale 1). */
export interface WordBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Character offsets of the word inside Block.text */
  start: number;
  end: number;
}

export type BlockKind = 'heading' | 'para' | 'row';

export interface Block {
  idx: number;
  kind: BlockKind;
  /** Heading level or list level, 0 when unknown */
  level: number;
  /** Full visible text, including the clause number */
  text: string;
  /** Clause number as written, e.g. "MADDE 7", "5.2.", "(b)" */
  label: string;
  /** Normalised clause id, e.g. "7", "5.2", "b" */
  clause: string;
  /** Text without the clause number; this is what gets compared */
  body: string;
  /** Offset of `body` inside `text` */
  bodyStart: number;
  page?: number;
  boxes?: WordBox[];
  align?: 'center' | 'right';
  bold?: boolean;
  /** Parallel (bilingual) layouts: which column the block sits in */
  col?: 0 | 1;
  /** Parallel layouts: blocks sharing a group are translations of each other */
  group?: number;
  /** Language of the block's column, when the columns differ in language */
  lang?: string;
}

/**
 * tracked-changes: a Word file with unaccepted revisions
 * ocr-text:        a PDF whose text layer was made by OCR (a searchable scan)
 * ocr-engine:      a scan whose text was recognised while parsing (OcrProvider)
 */
export type WarningCode = 'tracked-changes' | 'ocr-text' | 'ocr-engine';

export interface DocModel {
  id: string;
  name: string;
  kind: FileKind;
  size: number;
  blocks: Block[];
  pageCount?: number;
  /** Page sizes for PDFs (scale 1) */
  pages?: { width: number; height: number }[];
  /** Set for side-by-side bilingual documents: language of column 0 and column 1 */
  langs?: [string, string];
  /** Where the text came from when it is OCR: an existing text layer, or recognised while parsing */
  ocr?: 'layer' | 'engine';
  warnings: WarningCode[];
}

export interface CompareOptions {
  ignoreCase: boolean;
  ignorePunctuation: boolean;
  detectMoves: boolean;
  /** Report clause renumbering (5.3 -> 5.4) as a change */
  showRenumbering: boolean;
  /** Language/jurisdiction knowledge; defaults to Turkish + English */
  profile?: Profile;
}

export const defaultOptions: CompareOptions = {
  ignoreCase: false,
  ignorePunctuation: false,
  detectMoves: true,
  showRenumbering: false,
};

export type Op =
  | { t: 'eq'; l: number; r: number }
  | { t: 'mod'; l: number; r: number }
  | { t: 'del'; l: number }
  | { t: 'ins'; r: number }
  /** Emitted where the moved text used to be (old document order) */
  | { t: 'movsrc'; l: number; r: number }
  /** Emitted where the moved text now is (new document order) */
  | { t: 'movdst'; l: number; r: number };

export type SegKind = 'eq' | 'del' | 'ins';

/** Inline diff segment. Offsets are into Block.text of each side. */
export interface Seg {
  k: SegKind;
  text: string;
  /** Offset range on the old side (eq and del) */
  ls?: number;
  le?: number;
  /** Offset range on the new side (eq and ins) */
  rs?: number;
  re?: number;
}

export interface Edit {
  before: string;
  after: string;
}

export type ChangeType = 'mod' | 'ins' | 'del' | 'move' | 'renum';

/**
 * number:     an amount, date, duration or percentage changed
 * legal:      wording that shifts rights or obligations changed
 * unmirrored: bilingual text changed in one language but not in its counterpart
 * ocr:        the difference looks like a scanning mistake (only in OCR'd documents)
 */
export type Flag = 'number' | 'legal' | 'unmirrored' | 'ocr';

/** What a change is about; the UI turns this into a sentence in the user's language. */
export type Subject =
  | { kind: 'heading'; name: string; article: boolean }
  | { kind: 'paras'; count: number }
  | { kind: 'para' }
  | { kind: 'row' };

export interface Loc {
  /** "5.2", "7", "5.2 (b)" or '' */
  clause: string;
  /** Title of the enclosing heading, e.g. "Payment Terms" */
  title: string;
  page?: number;
  /** 1-based paragraph index, the fallback location */
  para: number;
}

export interface Change {
  id: string;
  n: number;
  type: ChangeType;
  l: number[];
  r: number[];
  locL?: Loc;
  locR?: Loc;
  subject: Subject;
  edits: Edit[];
  flags: Flag[];
  /** Moves only: the moved text was also edited */
  moveEdited?: boolean;
  /** Row keys that belong to this change; the first one is the scroll anchor */
  rows: string[];
  /** Short preview of the affected text */
  excerpt: string;
  /** Language of the affected column in bilingual documents */
  lang?: string;
  /** Renumbering only */
  renum?: { from: string; to: string };
}

export interface Row {
  key: string;
  op: Op;
  changeId?: string;
}

export interface Section {
  side: 'L' | 'R';
  block: number;
  clause: string;
  title: string;
  /** Blocks covered by this section, [start, end) */
  start: number;
  end: number;
}

export interface Comparison {
  left: DocModel;
  right: DocModel;
  options: CompareOptions;
  ops: Op[];
  rows: Row[];
  changes: Change[];
  locL: Loc[];
  locR: Loc[];
  sectionsL: Section[];
  sectionsR: Section[];
  /** Inline segments keyed by `${l}:${r}` */
  inline: Map<string, Seg[]>;
  /** change id by block index */
  changeOfL: Map<number, string>;
  changeOfR: Map<number, string>;
  /** Languages of a bilingual comparison, from whichever side has them */
  langs?: [string, string];
  /** flagged: changes with a number/legal/unmirrored flag; ocr: changes that look like scanning mistakes */
  stats: Record<ChangeType, number> & { total: number; flagged: number; renumHidden: number; ocr: number };
}
