/**
 * @redline/react: review UI for document comparisons.
 *
 *   import { RedlineViewer } from '@redline/react';
 *   import '@redline/react/styles.css';
 *   <RedlineViewer original={fileA} revised={fileB} locale="tr" onBack={reset} />
 *
 * Every piece is also exported on its own (ChangeList, SideBySideView, ...)
 * for hosts that want their own layout.
 */
export { RedlineViewer } from './RedlineViewer';
export type { RedlineViewerProps, ExportKind } from './RedlineViewer';
export { FilePicker } from './FilePicker';
export type { FilePickerProps, Sample } from './FilePicker';
export { useComparison } from './useComparison';
export type { ComparisonState, DocSide, UseComparisonExtras } from './useComparison';
export { ChangeList, filterChanges, emptyFilters, isOcrLike, needsAttention } from './ChangeList';
export type { ChangeListProps, ChangeFilters } from './ChangeList';
export { SideBySideView } from './views/SideBySideView';
export { RedlineView } from './views/RedlineView';
export { ClauseMap } from './views/ClauseMap';
export { PageView } from './views/PageView';
export type { ViewId, ViewProps } from './views/types';
export { BlockText } from './components/BlockText';
export { Notices } from './components/Notices';
export { OcrBadge } from './components/OcrBadge';
export { useMessages } from './lib/messages';
