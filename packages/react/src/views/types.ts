import type { Comparison, Messages } from '@redline/core';

export type ViewId = 'side' | 'redline' | 'map' | 'pages';

/**
 * Contract shared by every document view. Views are stateless about selection:
 * the viewer owns the active change and tells views when to scroll to it.
 */
export interface ViewProps {
  cmp: Comparison;
  m: Messages;
  /** Currently selected change id (Change.id), or null */
  activeId: string | null;
  /** Select a change, e.g. when its text is clicked in the document */
  onSelect: (id: string) => void;
  /** Incremented every time the viewer wants the active change scrolled into view */
  scrollSignal: number;
  /** Bilingual documents: show only this language ('tr', 'en'), or null for both */
  lang: string | null;
  /** Scroll request for one row (Row.key), e.g. a heading picked on the clause map. Rows carry data-row-key. */
  focusRow?: { key: string; signal: number } | null;
  /** Change ids the reviewer chose to hide (e.g. possible OCR errors): left out of overview rulers, marks stay in the text */
  hiddenChanges?: ReadonlySet<string>;
  /** Switch to another view and reveal a change there (e.g. the clause map jumps to side-by-side) */
  onNavigate?: (view: ViewId, changeId?: string, blockRef?: { side: 'L' | 'R'; block: number }) => void;
}
