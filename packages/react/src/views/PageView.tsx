import { FileDocIcon, FilePdfIcon, InfoIcon } from '@phosphor-icons/react';
import { Fragment, memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { describeChange, moveNote, renderPdfPage, sideSpans, type Change, type Comparison, type DocModel, type Messages, type Side } from '@redline/core';
import { OcrBadge } from '../components/OcrBadge';
import { blockOf, computeHighlights, MARK_HEIGHT, markBackground, type Highlight } from './pageview-highlights';
import type { ViewProps } from './types';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const PAD = 24;
const MAX_PAGE_WIDTH = 920;

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function scrollPaneTo(scroller: HTMLElement, y: number) {
  scroller.scrollTo({ top: Math.max(0, y - scroller.clientHeight / 2), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** y of an element's top inside a scroll container's content box */
function offsetIn(scroller: HTMLElement, el: Element) {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

/** Table rows carry " │ " between cells; render the separator muted. */
function withCells(text: string): ReactNode {
  if (!text.includes('│')) return text;
  return text.split('│').map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="rl-cell-sep">│</span>}
      {part}
    </Fragment>
  ));
}

/**
 * Page view: the real PDF pages with every change marked on them. A Word side
 * has no fixed pages, so it is shown as flowing text instead.
 */
export function PageView(props: ViewProps) {
  return (
    <div className="rl:grid rl:h-full rl:min-h-0 rl:grid-rows-2 rl:bg-canvas rl:md:grid-cols-2 rl:md:grid-rows-1">
      <Pane {...props} side="L" />
      <Pane {...props} side="R" />
    </div>
  );
}

function Pane(props: ViewProps & { side: Side }) {
  const { cmp, m, side } = props;
  const doc = side === 'L' ? cmp.left : cmp.right;
  const scroller = useRef<HTMLDivElement>(null);
  const isPdf = doc.kind === 'pdf' && !!doc.pages?.length;
  const Icon = doc.kind === 'pdf' ? FilePdfIcon : FileDocIcon;

  return (
    <section className={cx('rl:flex rl:min-h-0 rl:min-w-0 rl:flex-col', side === 'R' && 'rl:border-t rl:border-line rl:md:border-t-0 rl:md:border-l')}>
      <header className="rl:flex rl:h-11 rl:shrink-0 rl:items-center rl:gap-2 rl:border-b rl:border-line rl:bg-surface rl:px-4">
        <span className="rl:shrink-0 rl:text-[12.5px] rl:font-semibold rl:text-ink">{side === 'L' ? m.doc.original : m.doc.revised}</span>
        <Icon size={15} className="rl:shrink-0 rl:text-ink-3" aria-hidden />
        <span className="rl:min-w-0 rl:truncate rl:text-[12.5px] rl:text-ink-3" title={doc.name}>
          {doc.name}
        </span>
        <OcrBadge doc={doc} m={m} />
        {doc.pageCount ? <span className="rl:ml-auto rl:shrink-0 rl:text-[12px] rl:text-ink-3 tnum">{m.doc.pages(doc.pageCount)}</span> : null}
      </header>
      <div ref={scroller} className="rl-scroll rl:relative rl:min-h-0 rl:flex-1 rl:overflow-y-auto rl:overflow-x-hidden">
        {isPdf ? <PdfPane {...props} doc={doc} scroller={scroller} /> : <TextPane {...props} doc={doc} scroller={scroller} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- PDF pane

function usePaneWidth(scroller: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => setWidth(Math.max(200, Math.min(MAX_PAGE_WIDTH, Math.floor(el.clientWidth - PAD * 2))));
    measure();
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 160);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [scroller]);
  return width;
}

function PdfPane(props: ViewProps & { side: Side; doc: DocModel; scroller: RefObject<HTMLDivElement | null> }) {
  const { cmp, m, side, doc, scroller, activeId, onSelect, scrollSignal, focusRow } = props;
  const width = usePaneWidth(scroller);
  const highlights = useMemo(() => computeHighlights(cmp, side), [cmp, side]);
  const changes = useMemo(() => new Map(cmp.changes.map((c) => [c.id, c])), [cmp]);
  const pages = doc.pages ?? [];
  const ready = width > 0;

  // Scroll to the active change's first mark on this side.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !ready || !activeId) return;
    const hl = highlights.firstByChange.get(activeId);
    if (hl) scrollToPoint(el, doc, width, hl.page, hl.y);
  }, [scrollSignal, ready]);

  // Scroll to a specific row (e.g. a heading picked on the clause map).
  useEffect(() => {
    const el = scroller.current;
    if (!el || !ready || !focusRow) return;
    const at = highlights.firstByRow.get(focusRow.key);
    if (at) scrollToPoint(el, doc, width, at.page, at.y);
  }, [focusRow?.signal, ready]);

  if (!ready) return null;
  return (
    <div className="rl:flex rl:flex-col rl:items-center rl:gap-6 rl:py-6">
      {pages.map((p, i) => (
        <PdfPage
          key={i}
          docId={doc.id}
          pageNo={i + 1}
          size={p}
          width={width}
          root={scroller}
          marks={highlights.byPage.get(i + 1) ?? []}
          activeId={activeId}
          onSelect={onSelect}
          describe={(id) => {
            const c = changes.get(id);
            return c ? describeChange(c, m) : '';
          }}
          label={m.doc.pageN(i + 1)}
        />
      ))}
    </div>
  );
}

function scrollToPoint(scroller: HTMLElement, doc: DocModel, width: number, page: number, y: number) {
  const pageEl = scroller.querySelector(`[data-page="${page}"]`);
  const size = doc.pages?.[page - 1];
  if (!pageEl || !size) return;
  scrollPaneTo(scroller, offsetIn(scroller, pageEl) + y * (width / size.width));
}

interface PdfPageProps {
  docId: string;
  pageNo: number;
  size: { width: number; height: number };
  width: number;
  root: RefObject<HTMLDivElement | null>;
  marks: Highlight[];
  activeId: string | null;
  onSelect: (id: string) => void;
  describe: (changeId: string) => string;
  label: string;
}

const PdfPage = memo(function PdfPage({ docId, pageNo, size, width, root, marks, activeId, onSelect, describe, label }: PdfPageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const scale = width / size.width;
  const height = Math.round(size.height * scale);

  // Render only pages near the viewport; once rendered a page stays rendered.
  useEffect(() => {
    const el = holder.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: root.current, rootMargin: '900px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root, visible]);

  // Renders are queued: pdf.js refuses two concurrent renders into one canvas.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    queue.current = queue.current
      .then(async () => {
        if (cancelled || !canvas.current) return;
        const ok = await renderPdfPage(docId, pageNo, canvas.current, width);
        if (!cancelled && ok !== null) setRendered(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, width, docId, pageNo]);

  return (
    <figure className="rl:flex rl:flex-col rl:items-center rl:gap-2">
      <div
        ref={holder}
        data-page={pageNo}
        className="rl:relative rl:overflow-hidden rl:rounded-[3px] rl:bg-white rl:shadow-pop"
        style={{ width, height }}
      >
        <canvas ref={canvas} className={cx('rl:absolute rl:inset-0', !rendered && 'rl:opacity-0')} aria-hidden />
        {!rendered && <div className="rl-skeleton rl:absolute rl:inset-x-10 rl:top-12 rl:h-3 rl:rounded-full rl:opacity-60" />}
        <div className="rl:absolute rl:inset-0">
          {marks.map((hl, i) => {
            const active = !!hl.changeId && hl.changeId === activeId;
            const text = hl.changeId ? describe(hl.changeId) : '';
            return (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                aria-label={text}
                title={text}
                onClick={() => hl.changeId && onSelect(hl.changeId)}
                className="rl:absolute rl:cursor-pointer rl:rounded-[2px]"
                style={{
                  left: hl.x * scale - 1,
                  top: hl.y * scale,
                  width: hl.w * scale + 2,
                  // Extend below the word box so underlines clear the baseline (see markBackground).
                  height: hl.h * scale * MARK_HEIGHT,
                  background: markBackground(hl.kind),
                  mixBlendMode: 'multiply',
                  outline: active ? '2px solid #16181c' : undefined,
                  outlineOffset: active ? 1 : undefined,
                }}
              />
            );
          })}
        </div>
      </div>
      <figcaption className="rl:text-[11.5px] rl:text-ink-3 tnum">{label}</figcaption>
    </figure>
  );
});

// ---------------------------------------------------------------- Text pane (Word side)

function TextPane(props: ViewProps & { side: Side; doc: DocModel; scroller: RefObject<HTMLDivElement | null> }) {
  const { cmp, m, side, doc, scroller, activeId, onSelect, scrollSignal, focusRow, lang } = props;
  const types = useMemo(() => new Map<string, Change['type']>(cmp.changes.map((c) => [c.id, c.type])), [cmp]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !activeId) return;
    const target = el.querySelector(`[data-change="${activeId}"]`);
    if (target) scrollPaneTo(el, offsetIn(el, target) + (target as HTMLElement).offsetHeight / 2);
  }, [scrollSignal]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !focusRow) return;
    const target = el.querySelector(`[data-row-key="${CSS.escape(focusRow.key)}"]`);
    if (target) scrollPaneTo(el, offsetIn(el, target) + (target as HTMLElement).offsetHeight / 2);
  }, [focusRow?.signal]);

  return (
    <div className="rl:px-4 rl:pt-3 rl:pb-8">
      <p className="rl:mb-3 rl:flex rl:items-start rl:gap-1.5 rl:text-[12px] rl:text-ink-3">
        <InfoIcon size={14} className="rl:mt-px rl:shrink-0" aria-hidden />
        {m.doc.textOnly}
      </p>
      <div className="rl:mx-auto rl:max-w-[760px] rl:rounded-panel rl:border rl:border-line rl:bg-paper rl:py-5">
        {cmp.rows.map((row) => (
          <TextRow
            key={row.key}
            cmp={cmp}
            m={m}
            side={side}
            doc={doc}
            rowKey={row.key}
            op={row.op}
            fallbackChangeId={row.changeId}
            types={types}
            activeId={activeId}
            onSelect={onSelect}
            lang={lang}
          />
        ))}
      </div>
    </div>
  );
}

function TextRow({
  cmp,
  m,
  side,
  doc,
  rowKey,
  op,
  fallbackChangeId,
  types,
  activeId,
  onSelect,
  lang,
}: {
  cmp: Comparison;
  m: Messages;
  side: Side;
  doc: DocModel;
  rowKey: string;
  op: Comparison['ops'][number];
  fallbackChangeId?: string;
  types: Map<string, Change['type']>;
  activeId: string | null;
  onSelect: (id: string) => void;
  lang: string | null;
}) {
  const idx = blockOf(op, side);
  if (idx === undefined) return null;
  const block = doc.blocks[idx];
  if (!block || (lang && block.lang && block.lang !== lang)) return null;
  const changeId = (side === 'L' ? cmp.changeOfL : cmp.changeOfR).get(idx) ?? fallbackChangeId;
  const spans = sideSpans(cmp, op, side);
  const type = changeId ? types.get(changeId) : undefined;
  // One note per moved run: only where the previous block is not part of the same move.
  const firstOfRun =
    (op.t === 'movsrc' && side === 'L' && cmp.changeOfL.get(op.l - 1) !== changeId) ||
    (op.t === 'movdst' && side === 'R' && cmp.changeOfR.get(op.r - 1) !== changeId);
  const note = firstOfRun ? moveNote(cmp, op, m) : null;
  const select = changeId ? () => onSelect(changeId) : undefined;
  const onKey = (e: KeyboardEvent) => {
    if (select && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select();
    }
  };
  return (
    <div
      data-row-key={rowKey}
      data-change={changeId}
      role={select ? 'button' : undefined}
      tabIndex={select ? 0 : undefined}
      onClick={select}
      onKeyDown={select ? onKey : undefined}
      className={cx('rl:px-6 rl:py-1', type && `bar-${type}`, changeId && changeId === activeId && 'is-active', select && 'rl:cursor-pointer')}
    >
      {note && <div className="rl:mb-0.5 rl:text-[11.5px] rl:font-medium rl:text-mov">{note}</div>}
      <p className={cx('rl-doc', block.kind === 'heading' && 'rl-doc-heading rl:pt-2', block.align === 'center' && 'rl:text-center')}>
        {block.label && <span className="rl-label rl:mr-2">{block.label}</span>}
        {spans.map((s, i) =>
          s.k === 'eq' ? (
            <Fragment key={i}>{withCells(s.text)}</Fragment>
          ) : (
            <span key={i} className={`mk-${s.k}`}>
              {withCells(s.text)}
            </span>
          ),
        )}
      </p>
    </div>
  );
}

