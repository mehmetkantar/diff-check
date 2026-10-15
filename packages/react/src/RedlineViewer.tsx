import {
  changeKey, compareDocs, defaultOptions as coreDefaults, toCSV, toHTMLReport, toJSON, toTrackedDocx, type Change, type CompareOptions,
  type Comparison, type DocumentInput, type Messages, type OcrProvider,
} from '@redline/core';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChangeList, emptyFilters, filterChanges, isOcrLike, type ChangeFilters } from './ChangeList';
import { Notices } from './components/Notices';
import { ErrorState, IdleState, LoadingState } from './components/States';
import { TopBar, type ExportKind } from './components/TopBar';
import { useControlled } from './lib/controlled';
import { baseName, downloadBlob, printHtml } from './lib/download';
import { useMessages } from './lib/messages';
import { rowKeyOfBlock } from './lib/rows';
import { useResolvedTheme } from './lib/theme';
import { ViewBoundary } from './components/ViewBoundary';
import { useComparison } from './useComparison';
import { ClauseMap } from './views/ClauseMap';
import { PageView } from './views/PageView';
import { RedlineView } from './views/RedlineView';
import { SideBySideView } from './views/SideBySideView';
import type { ViewId, ViewProps } from './views/types';

export type { ExportKind };

export interface RedlineViewerProps {
  /** Documents to parse and compare inside the viewer */
  original?: DocumentInput;
  revised?: DocumentInput;
  /** Or a ready comparison, e.g. computed on a server or in a worker */
  comparison?: Comparison;
  /**
   * OCR engine for scanned PDFs without a text layer (e.g. createTesseractOcr from @redline/ocr).
   * Without one, such files show the "no selectable text" error. Keep the same instance across
   * renders; a new instance re-reads the documents.
   */
  ocr?: OcrProvider;
  options?: Partial<CompareOptions>;
  defaultOptions?: Partial<CompareOptions>;
  onOptionsChange?: (o: CompareOptions) => void;
  /** 'en', 'tr' or a custom Messages object; defaults to the browser language */
  locale?: 'en' | 'tr' | Messages;
  theme?: 'light' | 'dark' | 'system';
  /** Called when the user flips the theme in the top bar, so a host can remember it */
  onThemeChange?: (theme: 'light' | 'dark') => void;
  view?: ViewId;
  defaultView?: ViewId;
  onViewChange?: (v: ViewId) => void;
  /** Views to offer; 'pages' is only enabled when a PDF is involved */
  views?: ViewId[];
  /** Reviewed change keys (see changeKey) */
  reviewed?: string[];
  defaultReviewed?: string[];
  onReviewedChange?: (keys: string[]) => void;
  onChangeSelect?: (change: Change | null) => void;
  /** Shows a "New comparison" button */
  onBack?: () => void;
  /** Host actions placed at the end of the top bar */
  toolbarEnd?: ReactNode;
  exports?: ExportKind[] | false;
  /** Called instead of downloading when set */
  onExport?: (kind: ExportKind, file: Blob, filename: string) => void;
  /** Rendering errors inside a view are contained and reported here (e.g. to the host's logging) */
  onError?: (error: Error) => void;
  className?: string;
  style?: CSSProperties;
}

const ALL_VIEWS: ViewId[] = ['side', 'redline', 'map', 'pages'];
const ALL_EXPORTS: ExportKind[] = ['print', 'docx', 'csv', 'json'];

const optionsKey = (o: Partial<CompareOptions>) => JSON.stringify({ ...o, profile: undefined });

function initialView(): ViewId {
  // Two columns do not fit a phone; start those users on the single-column redline.
  return typeof window !== 'undefined' && window.innerWidth < 900 ? 'redline' : 'side';
}

const VIEW_COMPONENT: Record<ViewId, (p: ViewProps) => ReactNode> = {
  side: SideBySideView,
  redline: RedlineView,
  map: ClauseMap,
  pages: PageView,
};

/**
 * The complete review experience: change list, document views, settings and
 * exports. Fills its container; give the parent a height.
 */
export function RedlineViewer(props: RedlineViewerProps) {
  const m = useMessages(props.locale);
  const root = useRef<HTMLDivElement>(null);
  // Width of the viewer itself (not the window), since hosts may embed it in a panel.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const searchRef = useRef<HTMLInputElement>(null);

  // ---- theme ----
  const resolvedTheme = useResolvedTheme(props.theme ?? 'system');
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(null);
  useEffect(() => setThemeOverride(null), [props.theme]);
  const theme = themeOverride ?? resolvedTheme;
  const [blackWhite, setBlackWhite] = useState(false);

  // ---- options and comparison ----
  const [options, setOptions] = useControlled<CompareOptions>(
    props.options ? { ...coreDefaults, ...props.options } : undefined,
    { ...coreDefaults, ...props.defaultOptions },
    props.onOptionsChange,
  );
  const external = props.comparison;
  const state = useComparison(external ? undefined : props.original, external ? undefined : props.revised, options, { ocr: props.ocr });
  const key = optionsKey(options);
  const externalCmp = useMemo(() => {
    if (!external) return null;
    // A supplied comparison is re-run locally when the user changes settings.
    return optionsKey(external.options) === key ? external : compareDocs(external.left, external.right, { ...options });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external, key]);
  const cmp = externalCmp ?? state.comparison;

  // ---- view ----
  const hasPdf = !!cmp && (cmp.left.kind === 'pdf' || cmp.right.kind === 'pdf');
  const views = useMemo(() => (props.views?.length ? ALL_VIEWS.filter((v) => props.views!.includes(v)) : ALL_VIEWS), [props.views]);
  const [viewRaw, setView] = useControlled<ViewId>(props.view, props.defaultView ?? initialView(), props.onViewChange);
  const view: ViewId = !views.includes(viewRaw) || (viewRaw === 'pages' && !hasPdf) ? (views.find((v) => v !== 'pages') ?? 'side') : viewRaw;

  // ---- review state ----
  const [reviewedList, setReviewed] = useControlled<string[]>(props.reviewed, props.defaultReviewed ?? [], props.onReviewedChange);
  const reviewed = useMemo(() => new Set(reviewedList), [reviewedList]);
  const reviewedRef = useRef(reviewedList);
  reviewedRef.current = reviewedList;
  const toggleReviewed = useCallback(
    (k: string) => {
      const cur = reviewedRef.current;
      setReviewed(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
    },
    [setReviewed],
  );

  // ---- selection ----
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollSignal, setScrollSignal] = useState(0);
  const [focusRow, setFocusRow] = useState<{ key: string; signal: number } | null>(null);
  const [filters, setFilters] = useState<ChangeFilters>(emptyFilters);
  const [lang, setLang] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // Change ids are positional; keep the same change selected across re-comparisons.
  const activeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cmp) return;
    const k = activeKeyRef.current;
    const again = k ? cmp.changes.find((c) => changeKey(c) === k) : undefined;
    setActiveId(again?.id ?? null);
  }, [cmp]);

  const onChangeSelect = props.onChangeSelect;
  const select = useCallback(
    (id: string | null, scroll: boolean) => {
      setActiveId(id);
      const c = id && cmp ? cmp.changes.find((x) => x.id === id) ?? null : null;
      activeKeyRef.current = c ? changeKey(c) : null;
      onChangeSelect?.(c);
      if (scroll) setScrollSignal((s) => s + 1);
    },
    [cmp, onChangeSelect],
  );
  const selectFromList = useCallback(
    (id: string) => {
      select(id, true);
      setListOpen(false);
    },
    [select],
  );
  const selectFromView = useCallback((id: string) => select(id, false), [select]);

  const visible = useMemo(() => (cmp ? filterChanges(cmp, filters, lang, m) : []), [cmp, filters, lang, m]);
  const hiddenChanges = useMemo(
    () => new Set(cmp && filters.hideOcr ? cmp.changes.filter(isOcrLike).map((c) => c.id) : []),
    [cmp, filters.hideOcr],
  );
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!visible.length) return;
      const at = visible.findIndex((c) => c.id === activeId);
      const next = at < 0 ? (dir === 1 ? 0 : visible.length - 1) : Math.min(visible.length - 1, Math.max(0, at + dir));
      select(visible[next].id, true);
    },
    [visible, activeId, select],
  );

  const jumpTo = useCallback(
    (changeId: string, side: 'L' | 'R') => {
      const c = cmp?.changes.find((x) => x.id === changeId);
      if (!c) return;
      select(changeId, false);
      const key = side === 'L' ? `ms${c.l[0]}` : `md${c.r[0]}`;
      setFocusRow((f) => ({ key, signal: (f?.signal ?? 0) + 1 }));
      setListOpen(false);
    },
    [cmp, select],
  );

  const navigate = useCallback<NonNullable<ViewProps['onNavigate']>>(
    (v, changeId, blockRef) => {
      setView(v);
      if (changeId) select(changeId, true);
      if (blockRef && cmp) {
        const key = rowKeyOfBlock(cmp, blockRef.side, blockRef.block);
        if (key) setFocusRow((f) => ({ key, signal: (f?.signal ?? 0) + 1 }));
      }
    },
    [cmp, select, setView],
  );

  // ---- keyboard ----
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (!cmp || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const inside = !!t && (root.current?.contains(t) || t === document.body || t === document.documentElement);
    if (!inside || !t) return;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    const inList = !!t.closest('[data-rl-list]');
    switch (e.key) {
      case 'j':
      case 'J':
      case 'F7':
        step(1);
        break;
      case 'k':
      case 'K':
      case 'F6':
        step(-1);
        break;
      case 'ArrowDown':
        if (!inList) return;
        step(1);
        break;
      case 'ArrowUp':
        if (!inList) return;
        step(-1);
        break;
      case 'r':
      case 'R': {
        const c = cmp.changes.find((x) => x.id === activeId);
        if (!c) return;
        toggleReviewed(changeKey(c));
        break;
      }
      case '/':
        setListOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
        break;
      case '1':
      case '2':
      case '3':
      case '4': {
        const v = views[Number(e.key) - 1];
        if (!v || (v === 'pages' && !hasPdf)) return;
        setView(v);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---- exports ----
  const exportsList = props.exports === false ? [] : props.exports ?? ALL_EXPORTS;
  const onExport = props.onExport;
  const runExport = useCallback(
    async (kind: ExportKind) => {
      if (!cmp) return;
      const base = baseName(cmp.right.name);
      const deliver = (blob: Blob, filename: string) => (onExport ? onExport(kind, blob, filename) : downloadBlob(blob, filename));
      switch (kind) {
        case 'print': {
          const html = toHTMLReport(cmp, m, { blackWhite });
          if (onExport) onExport(kind, new Blob([html], { type: 'text/html;charset=utf-8' }), `${base}-report.html`);
          else printHtml(html);
          return;
        }
        case 'docx': {
          const bytes = await toTrackedDocx(cmp, m);
          return deliver(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${base}-redline.docx`);
        }
        case 'csv':
          return deliver(new Blob([toCSV(cmp, m)], { type: 'text/csv;charset=utf-8' }), `${base}-changes.csv`);
        case 'json':
          return deliver(new Blob([JSON.stringify(toJSON(cmp, m), null, 2)], { type: 'application/json' }), `${base}-comparison.json`);
      }
    },
    [cmp, m, blackWhite, onExport],
  );

  // ---- render ----
  const status = externalCmp ? 'ready' : state.status;
  let body: ReactNode;
  if (!cmp && (status === 'reading' || status === 'comparing')) {
    const pr = state.progress;
    const input = pr ? (pr.side === 'original' ? props.original : props.revised) : undefined;
    const name = input && typeof (input as { name?: unknown }).name === 'string' ? (input as { name: string }).name : '';
    const ocrProgress = pr
      ? { fileLabel: [pr.side === 'original' ? m.pick.original : m.pick.revised, name].filter(Boolean).join(': '), page: pr.page, pages: pr.pages }
      : null;
    body = <LoadingState m={m} phase={status} ocr={ocrProgress} />;
  }
  else if (status === 'error' && state.error) {
    const side = state.error.side;
    const input = side === 'original' ? props.original : side === 'revised' ? props.revised : undefined;
    const name = input && typeof (input as { name?: unknown }).name === 'string' ? (input as { name: string }).name : '';
    const sideLabel = side === 'original' ? m.pick.original : side === 'revised' ? m.pick.revised : '';
    body = <ErrorState m={m} code={state.error.code} fileLabel={[sideLabel, name].filter(Boolean).join(': ')} onBack={props.onBack} />;
  } else if (!cmp) body = <IdleState m={m} />;
  else {
    // Two columns of contract text do not fit a phone: show the single-column redline instead,
    // without changing the selected view, so widening the viewer brings side-by-side back.
    const View = VIEW_COMPONENT[narrow && view === 'side' ? 'redline' : view];
    const viewProps: ViewProps = {
      cmp,
      m,
      activeId,
      onSelect: selectFromView,
      scrollSignal,
      lang,
      focusRow,
      hiddenChanges,
      onNavigate: navigate,
    };
    const list = (
      <ChangeList
        cmp={cmp}
        m={m}
        activeId={activeId}
        onSelect={selectFromList}
        reviewed={reviewed}
        onToggleReviewed={toggleReviewed}
        filters={filters}
        onFiltersChange={setFilters}
        lang={lang}
        onShowRenumbering={() => setOptions({ ...options, showRenumbering: true })}
        onJump={jumpTo}
        searchRef={searchRef}
      />
    );
    body = (
      <>
        <TopBar
          cmp={cmp}
          m={m}
          view={view}
          views={views}
          hasPdf={hasPdf}
          onView={setView}
          lang={lang}
          onLang={setLang}
          options={options}
          onOptions={setOptions}
          blackWhite={blackWhite}
          onBlackWhite={setBlackWhite}
          theme={theme}
          onToggleTheme={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            setThemeOverride(next);
            props.onThemeChange?.(next);
          }}
          exports={exportsList}
          onExport={(k) => void runExport(k)}
          onBack={props.onBack}
          onToggleList={() => setListOpen((o) => !o)}
          toolbarEnd={props.toolbarEnd}
        />
        <Notices cmp={cmp} m={m} />
        <div className="rl:relative rl:flex rl:min-h-0 rl:flex-1">
          <div className="rl:hidden rl:w-[360px] rl:shrink-0 rl:border-r rl:border-line rl:lg:block">{list}</div>
          {listOpen && (
            <div className="rl:absolute rl:inset-0 rl:z-30 rl:flex rl:lg:hidden">
              <div className="rl-fade-in rl:h-full rl:w-[min(360px,88%)] rl:border-r rl:border-line rl:shadow-pop">{list}</div>
              <button type="button" aria-label={m.list.count(cmp.changes.length)} className="rl:flex-1 rl:bg-ink/25" onClick={() => setListOpen(false)} />
            </div>
          )}
          <main className="rl:min-w-0 rl:flex-1" aria-busy={state.status === 'comparing'}>
            <ViewBoundary m={m} resetKey={`${view}:${cmp.left.id}:${cmp.right.id}`} onError={props.onError}>
              <View {...viewProps} />
            </ViewBoundary>
          </main>
        </div>
      </>
    );
  }

  return (
    <div
      ref={root}
      className={`rl rl:relative rl:flex rl:h-full rl:min-h-0 rl:flex-col rl:overflow-hidden ${props.className ?? ''}`}
      style={props.style}
      data-theme={theme}
      data-bw={blackWhite ? '' : undefined}
    >
      {body}
    </div>
  );
}
