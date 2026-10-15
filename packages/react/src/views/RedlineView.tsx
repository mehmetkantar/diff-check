import { ArrowBendDownRightIcon, ArrowBendUpLeftIcon } from '@phosphor-icons/react';
import { describeChange, moveNote, redlineBlock, redlineSpans, type Change, type Comparison, type Messages, type Op } from '@redline/core';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BlockText } from '../components/BlockText';
import { OverviewRuler, type RulerTick } from '../components/OverviewRuler';
import { rowVisible, typeColor, typeTone } from '../lib/rows';
import { activeSegments, revealRow, useRevealRows, type Seg } from './scroll';
import type { ViewProps } from './types';

/**
 * The classic blackline: one document where deletions and insertions sit
 * inline, change bars mark the margin and moved text carries a note pointing
 * to its other place.
 */
export function RedlineView({ cmp, m, activeId, onSelect, scrollSignal, lang, focusRow, hiddenChanges }: ViewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Map<string, { top: number; height: number }> | null>(null);

  useRevealRows(scroller, cmp, activeId, scrollSignal, focusRow);

  const rows = useMemo(() => cmp.rows.filter((r) => rowVisible(cmp, r.op, lang)), [cmp, lang]);
  const byId = useMemo(() => new Map(cmp.changes.map((c) => [c.id, c])), [cmp]);
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
      // Rows sit inside the paper; offsetTop is relative to the content wrapper.
      for (const node of Array.from(el.querySelectorAll<HTMLElement>('[data-row-key]'))) {
        map.set(node.dataset.rowKey!, { top: node.offsetTop + (node.offsetParent as HTMLElement | null)!.offsetTop, height: node.offsetHeight });
      }
      setGeo(map);
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
    return cmp.changes.flatMap((c) => {
      if (hiddenChanges?.has(c.id)) return [];
      const key = c.rows.find((k) => geo.has(k));
      if (!key) return [];
      const g = geo.get(key)!;
      return [{ id: c.id, top: offset + g.top, height: g.height, color: typeColor[c.type], label: `${c.n}. ${describeChange(c, m)}` }];
    });
  }, [geo, cmp, m, hiddenChanges]);

  return (
    <div className="rl:relative rl:h-full rl:min-h-0">
      <div ref={scroller} className="rl-scroll rl:h-full rl:overflow-y-auto rl:sm:pr-3">
        <div ref={content} className="rl:px-3 rl:py-6 rl:sm:px-6 rl:lg:py-10">
          <article className="rl:relative rl:mx-auto rl:max-w-[860px] rl:rounded-panel rl:bg-paper rl:py-10 rl:pr-6 rl:pl-12 rl:shadow-pop rl:sm:py-14 rl:sm:pr-16 rl:sm:pl-20">
            {rows.map((row) => (
              <RedlineRow
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
          </article>
        </div>
      </div>
      <OverviewRuler
        scroller={scroller}
        ticks={ticks}
        activeId={activeId}
        label={m.list.count(cmp.changes.length)}
        onTick={(id) => {
          const c = byId.get(id);
          if (c) jump(c.rows.find((k) => geo?.has(k)) ?? c.rows[0], id);
        }}
      />
    </div>
  );
}

interface RowProps {
  cmp: Comparison;
  m: Messages;
  rowKey: string;
  op: Op;
  change?: Change;
  badge?: Change;
  active: boolean;
  seg?: Seg;
  onSelect: (id: string) => void;
  onJump: (key: string, changeId?: string) => void;
}

const RedlineRow = memo(function RedlineRow({ cmp, m, rowKey, op, change, badge, active, seg, onSelect, onJump }: RowProps) {
  const { block } = redlineBlock(cmp, op);
  const heading = block.kind === 'heading';
  // One note per moved run (its first row carries the badge), not one per paragraph.
  const note = badge ? moveNote(cmp, op, m) : null;
  const partner = op.t === 'movsrc' ? `md${op.r}` : op.t === 'movdst' ? `ms${op.l}` : null;
  const NoteIcon = op.t === 'movsrc' ? ArrowBendDownRightIcon : ArrowBendUpLeftIcon;

  return (
    <div
      data-row-key={rowKey}
      data-seg={active ? seg : undefined}
      lang={block.lang}
      onClick={change ? () => onSelect(change.id) : undefined}
      className={`rl-doc rl:relative rl:py-[5px] rl:pl-4 ${change ? `${typeTone[change.type].bar} rl:cursor-pointer` : ''} ${
        heading ? `rl-doc-heading rl:pt-5 ${block.level <= 1 ? 'rl:text-[17px]' : ''}` : ''
      } ${block.align === 'center' ? 'rl:text-center' : ''} ${active ? 'is-active' : ''}`}
    >
      {badge && (
        <button
          type="button"
          aria-label={`${m.type[badge.type]} ${badge.n}`}
          title={describeChange(badge, m)}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(badge.id);
          }}
          className={`tnum rl:absolute rl:top-1.5 rl:-left-9 rl:flex rl:h-6 rl:min-w-6 rl:items-center rl:justify-center rl:rounded-full rl:border-[1.5px] rl:bg-paper rl:px-1 rl:font-ui rl:text-[11px] rl:font-semibold rl:sm:-left-12 ${typeTone[badge.type].border} ${typeTone[badge.type].text}`}
        >
          {badge.n}
        </button>
      )}
      {note && partner && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onJump(partner, change?.id);
          }}
          className="rl:mb-0.5 rl:flex rl:items-center rl:gap-1 rl:font-ui rl:text-[12px] rl:font-medium rl:text-mov rl:hover:underline"
        >
          <NoteIcon size={13} aria-hidden="true" />
          {note}
        </button>
      )}
      <BlockText block={block} spans={redlineSpans(cmp, op)} />
    </div>
  );
});
