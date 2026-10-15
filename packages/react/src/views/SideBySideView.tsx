import { ArrowBendDownRightIcon, ArrowBendUpLeftIcon, FileDocIcon, FilePdfIcon } from '@phosphor-icons/react';
import { describeChange, moveNote, sideSpans, type Change, type Comparison, type DocModel, type Messages, type Op } from '@redline/core';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BlockText } from '../components/BlockText';
import { OcrBadge } from '../components/OcrBadge';
import { OverviewRuler, type RulerTick } from '../components/OverviewRuler';
import { rowBlocks, rowVisible, typeColor, typeTone } from '../lib/rows';
import { activeSegments, revealRow, useRevealRows, type Seg } from './scroll';
import type { ViewProps } from './types';

const GRID = 'rl:grid rl:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] rl:sm:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]';

interface Geometry {
  rows: Map<string, { top: number; height: number }>;
  gutter: [number, number];
  height: number;
}

/**
 * Original and revised documents in one scroll container: each row is a grid
 * line [old | gutter | new], so the two sides can never drift apart. Moves are
 * drawn as bands across the gutter from the old place to the new one.
 */
export function SideBySideView({ cmp, m, activeId, onSelect, scrollSignal, lang, focusRow, hiddenChanges }: ViewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);

  useRevealRows(scroller, cmp, activeId, scrollSignal, focusRow);

  const rows = useMemo(() => cmp.rows.filter((r) => rowVisible(cmp, r.op, lang)), [cmp, lang]);
  const byId = useMemo(() => new Map(cmp.changes.map((c) => [c.id, c])), [cmp]);
  // A number badge on the first row of each change, and on the old place of a move.
  const badges = useMemo(() => {
    const out = new Map<string, Change>();
    for (const c of cmp.changes) {
      out.set(c.rows[0], c);
      if (c.type === 'move') out.set(`ms${c.l[0]}`, c);
    }
    return out;
  }, [cmp]);

  const segs = useMemo(() => activeSegments(rows, activeId), [rows, activeId]);

  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const measure = () => {
      const map = new Map<string, { top: number; height: number }>();
      let gutter: [number, number] = [0, 0];
      for (const node of Array.from(el.querySelectorAll<HTMLElement>('[data-row-key]'))) {
        map.set(node.dataset.rowKey!, { top: node.offsetTop, height: node.offsetHeight });
        if (!gutter[1]) {
          const g = node.children[1] as HTMLElement | undefined;
          if (g) gutter = [node.offsetLeft + g.offsetLeft, node.offsetLeft + g.offsetLeft + g.offsetWidth];
        }
      }
      setGeo({ rows: map, gutter, height: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  const jump = useCallback(
    (key: string, changeId?: string) => {
      revealRow(scroller.current, key);
      if (changeId) onSelect(changeId);
    },
    [onSelect],
  );

  const ticks = useMemo<RulerTick[]>(() => {
    if (!geo) return [];
    const offset = content.current?.offsetTop ?? 0;
    const out: RulerTick[] = [];
    for (const c of cmp.changes) {
      if (hiddenChanges?.has(c.id)) continue;
      const key = c.rows.find((k) => geo.rows.has(k));
      if (!key) continue;
      const g = geo.rows.get(key)!;
      out.push({ id: c.id, top: offset + g.top, height: g.height, color: typeColor[c.type], label: `${c.n}. ${describeChange(c, m)}` });
    }
    return out;
  }, [geo, cmp, m, hiddenChanges]);

  return (
    <div className="rl:relative rl:h-full rl:min-h-0">
      <div ref={scroller} className="rl-scroll rl:h-full rl:overflow-y-auto rl:sm:pr-3">
        <ColumnHeaders cmp={cmp} m={m} />
        <div ref={content} className="rl:relative rl:px-3 rl:pb-20 rl:lg:px-6">
          <div aria-hidden="true" className={`${GRID} rl:pointer-events-none rl:absolute rl:inset-x-3 rl:top-0 rl:bottom-16 rl:lg:inset-x-6`}>
            <div className="rl:rounded-panel rl:bg-paper rl:shadow-pop" />
            <div />
            <div className="rl:rounded-panel rl:bg-paper rl:shadow-pop" />
          </div>
          <div className="rl:h-8" />
          {rows.map((row) => (
            <SideRow
              key={row.key}
              cmp={cmp}
              m={m}
              rowKey={row.key}
              op={row.op}
              change={row.changeId ? byId.get(row.changeId) : undefined}
              badge={badges.get(row.key)}
              active={!!row.changeId && row.changeId === activeId}
              seg={segs.get(row.key)}
              onSelect={onSelect}
              onJump={jump}
            />
          ))}
          <div className="rl:h-10" />
          {geo && <MoveBands cmp={cmp} geo={geo} activeId={activeId} />}
        </div>
      </div>
      <OverviewRuler
        scroller={scroller}
        ticks={ticks}
        activeId={activeId}
        label={m.list.count(cmp.changes.length)}
        onTick={(id) => {
          const c = byId.get(id);
          if (c) jump(c.rows.find((k) => geo?.rows.has(k)) ?? c.rows[0], id);
        }}
      />
    </div>
  );
}

function DocTitle({ doc, label, m }: { doc: DocModel; label: string; m: Messages }) {
  const Icon = doc.kind === 'pdf' ? FilePdfIcon : FileDocIcon;
  return (
    <div className="rl:flex rl:min-w-0 rl:items-baseline rl:gap-2 rl:px-4 rl:lg:px-10">
      <span className="rl:shrink-0 rl:text-[12px] rl:font-semibold rl:text-ink">{label}</span>
      <span className="rl:flex rl:min-w-0 rl:items-center rl:gap-1 rl:text-[12px] rl:text-ink-3">
        <Icon size={14} className="rl:shrink-0 rl:self-center" aria-hidden="true" />
        <span className="rl:truncate">{doc.name}</span>
        <OcrBadge doc={doc} m={m} />
        {doc.pageCount ? <span className="rl:shrink-0 tnum">{m.doc.pages(doc.pageCount)}</span> : null}
      </span>
    </div>
  );
}

function ColumnHeaders({ cmp, m }: { cmp: Comparison; m: Messages }) {
  return (
    <div className={`${GRID} rl:sticky rl:top-0 rl:z-10 rl:border-b rl:border-line rl:bg-canvas/95 rl:px-3 rl:py-2.5 rl:backdrop-blur-sm rl:lg:px-6`}>
      <DocTitle doc={cmp.left} label={m.doc.original} m={m} />
      <div />
      <DocTitle doc={cmp.right} label={m.doc.revised} m={m} />
    </div>
  );
}

interface SideRowProps {
  cmp: Comparison;
  m: Messages;
  rowKey: string;
  op: Op;
  change?: Change;
  badge?: Change;
  active: boolean;
  /** Position inside a run of consecutive active rows, so the ring reads as one outline */
  seg?: Seg;
  onSelect: (id: string) => void;
  onJump: (key: string, changeId?: string) => void;
}

const SideRow = memo(function SideRow({ cmp, m, rowKey, op, change, badge, active, seg, onSelect, onJump }: SideRowProps) {
  const { l, r } = rowBlocks(cmp, op);
  const bar = change ? typeTone[change.type].bar : '';
  const note = moveNote(cmp, op, m);

  const cell = (side: 'L' | 'R') => {
    const block = side === 'L' ? l : r;
    if (!block) {
      // One "moved to/from" chip per moved block, on its first row.
      if ((op.t === 'movsrc' || op.t === 'movdst') && badge) {
        const target = op.t === 'movsrc' ? `md${op.r}` : `ms${op.l}`;
        const Icon = op.t === 'movsrc' ? ArrowBendDownRightIcon : ArrowBendUpLeftIcon;
        return (
          <div className="rl:flex rl:items-start rl:px-3 rl:py-1.5 rl:sm:px-6 rl:lg:px-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJump(target, change?.id);
              }}
              className="rl-press rl:inline-flex rl:max-w-full rl:items-center rl:gap-1.5 rl:rounded-full rl:border rl:border-mov/40 rl:bg-mov-bg rl:px-2.5 rl:py-1 rl:text-[12px] rl:font-medium rl:text-mov rl:hover:border-mov"
            >
              <Icon size={14} aria-hidden="true" className="rl:shrink-0" />
              <span className="rl:truncate">{note}</span>
            </button>
          </div>
        );
      }
      if (op.t === 'movsrc' || op.t === 'movdst') return <div />;
      return (
        <div className="rl:px-3 rl:py-1.5 rl:sm:px-6 rl:lg:px-10">
          <div role="img" aria-label={side === 'L' ? m.doc.notInOriginal : m.doc.notInRevised} className="rl-hatch rl:h-full rl:min-h-6 rl:rounded-[6px]" />
        </div>
      );
    }
    const heading = block.kind === 'heading';
    return (
      <div
        lang={block.lang}
        className={`rl-doc ${bar} rl:px-3 rl:sm:px-6 rl:lg:px-10 ${heading ? `rl-doc-heading rl:pt-5 rl:pb-1 ${block.level <= 1 ? 'rl:text-[17px]' : ''}` : 'rl:py-[5px]'} ${
          block.align === 'center' ? 'rl:text-center' : block.align === 'right' ? 'rl:text-right' : ''
        } ${block.kind === 'row' ? 'rl:text-[14.5px]' : ''}`}
      >
        <BlockText block={block} spans={sideSpans(cmp, op, side)} />
      </div>
    );
  };

  return (
    <div
      data-row-key={rowKey}
      data-seg={active ? seg : undefined}
      onClick={change ? () => onSelect(change.id) : undefined}
      className={`${GRID} rl:relative rl:rounded-[8px] ${change ? 'rl:cursor-pointer' : ''} ${active ? 'is-active' : ''}`}
    >
      {cell('L')}
      <div className="rl:flex rl:justify-center rl:pt-1">
        {badge && (
          <button
            type="button"
            aria-label={`${m.type[badge.type]} ${badge.n}`}
            title={describeChange(badge, m)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(badge.id);
            }}
            className={`tnum rl:relative rl:z-[1] rl:flex rl:h-6 rl:min-w-6 rl:items-center rl:justify-center rl:rounded-full rl:border-[1.5px] rl:bg-paper rl:px-1 rl:text-[11px] rl:font-semibold ${typeTone[badge.type].border} ${typeTone[badge.type].text}`}
          >
            {badge.n}
          </button>
        )}
      </div>
      {cell('R')}
    </div>
  );
});

/** Translucent bands across the gutter linking a move's old rows to its new rows. */
function MoveBands({ cmp, geo, activeId }: { cmp: Comparison; geo: Geometry; activeId: string | null }) {
  const [x0, x1] = geo.gutter;
  if (!x1) return null;
  const xm = (x0 + x1) / 2;
  const span = (keys: string[]) => {
    const gs = keys.map((k) => geo.rows.get(k)).filter(Boolean) as { top: number; height: number }[];
    if (!gs.length) return null;
    return [Math.min(...gs.map((g) => g.top)) + 4, Math.max(...gs.map((g) => g.top + g.height)) - 4] as const;
  };
  return (
    <svg aria-hidden="true" className="rl:pointer-events-none rl:absolute rl:top-0 rl:left-0 rl:overflow-visible" width="100%" height={geo.height}>
      {cmp.changes
        .filter((c) => c.type === 'move')
        .map((c) => {
          const src = span(c.l.map((l) => `ms${l}`));
          const dst = span(c.r.map((r) => `md${r}`));
          if (!src || !dst) return null;
          const on = c.id === activeId;
          const d = `M${x0},${src[0]} C${xm},${src[0]} ${xm},${dst[0]} ${x1},${dst[0]} L${x1},${dst[1]} C${xm},${dst[1]} ${xm},${src[1]} ${x0},${src[1]} Z`;
          return (
            <path
              key={c.id}
              d={d}
              fill="var(--rl-mov)"
              fillOpacity={on ? 0.26 : 0.12}
              stroke="var(--rl-mov)"
              strokeOpacity={on ? 0.8 : 0.45}
              strokeWidth={1}
            />
          );
        })}
    </svg>
  );
}
