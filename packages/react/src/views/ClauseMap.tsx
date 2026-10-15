import { TreeStructureIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import type { Block, Comparison, Messages, Op, Section } from '@redline/core';
import type { ViewProps } from './types';

const ROW_H = 52;
const GAP = 8;
const STEP = ROW_H + GAP;

type Status = 'unchanged' | 'changed' | 'moved' | 'added' | 'deleted';

interface MapNode {
  key: string;
  side: 'L' | 'R';
  section: Section;
  index: number;
  /** Changes inside this section, excluding the move of the section itself */
  count: number;
  status: Status;
  link?: string;
  /** "8 → 7" when the clause number changed */
  renum?: string;
}

interface MapLink {
  key: string;
  from: number;
  to: number;
  status: 'unchanged' | 'changed' | 'moved';
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Changes whose blocks fall inside a section (same column only, for bilingual documents). */
function countIn(cmp: Comparison, s: Section, blocks: Block[], side: 'L' | 'R', skipMove: boolean): number {
  const col = blocks[s.block].col;
  let n = 0;
  for (const c of cmp.changes) {
    if (skipMove && c.type === 'move') continue;
    const idx = side === 'L' ? c.l : c.r;
    if (idx.some((i) => i >= s.start && i < s.end && (col === undefined || blocks[i].col === col))) n++;
  }
  return n;
}

function buildMap(cmp: Comparison, lang: string | null) {
  const L = cmp.left.blocks;
  const R = cmp.right.blocks;
  const keep = (blocks: Block[]) => (s: Section) => !lang || !blocks[s.block].lang || blocks[s.block].lang === lang;
  const left = cmp.sectionsL.filter(keep(L));
  const right = cmp.sectionsR.filter(keep(R));
  const rightIndexByBlock = new Map(right.map((s, i) => [s.block, i]));

  const opByL = new Map<number, Op>();
  const opByR = new Map<number, Op>();
  for (const op of cmp.ops) {
    if (op.t !== 'ins' && op.t !== 'movdst') opByL.set(op.l, op);
    if (op.t !== 'del' && op.t !== 'movsrc') opByR.set(op.r, op);
  }

  const leftNodes: MapNode[] = left.map((s, index) => ({
    key: `L${s.block}`,
    side: 'L',
    section: s,
    index,
    count: countIn(cmp, s, L, 'L', true),
    status: 'unchanged',
  }));
  const rightNodes: MapNode[] = right.map((s, index) => ({
    key: `R${s.block}`,
    side: 'R',
    section: s,
    index,
    count: countIn(cmp, s, R, 'R', true),
    status: 'unchanged',
  }));

  const links: MapLink[] = [];
  const pairedRight = new Set<number>();
  for (const ln of leftNodes) {
    const op = opByL.get(ln.section.block);
    const r = op && op.t !== 'del' ? op.r : undefined;
    const ri = r === undefined ? undefined : rightIndexByBlock.get(r);
    if (ri === undefined) {
      ln.status = op?.t === 'del' ? 'deleted' : ln.count ? 'changed' : 'unchanged';
      continue;
    }
    const rn = rightNodes[ri];
    pairedRight.add(ri);
    const moved = op?.t === 'movsrc';
    const status: MapLink['status'] = moved ? 'moved' : ln.count || rn.count ? 'changed' : 'unchanged';
    const key = `${ln.key}-${rn.key}`;
    ln.status = rn.status = status;
    ln.link = rn.link = key;
    if (ln.section.clause && rn.section.clause && ln.section.clause !== rn.section.clause) {
      rn.renum = `${ln.section.clause} → ${rn.section.clause}`;
    }
    links.push({ key, from: ln.index, to: ri, status });
  }
  rightNodes.forEach((rn, ri) => {
    if (pairedRight.has(ri)) return;
    rn.status = opByR.get(rn.section.block)?.t === 'ins' ? 'added' : rn.count ? 'changed' : 'unchanged';
  });
  // Moved lines are drawn last so crossings stay readable.
  links.sort((a, b) => Number(a.status === 'moved') - Number(b.status === 'moved'));
  return { leftNodes, rightNodes, links };
}

const BAR: Record<Status, string | null> = {
  unchanged: null,
  changed: 'bar-mod',
  moved: 'bar-move',
  added: 'bar-ins',
  deleted: 'bar-del',
};

const STROKE: Record<MapLink['status'], { color: string; width: number }> = {
  unchanged: { color: 'var(--rl-line-strong)', width: 1.25 },
  changed: { color: 'var(--rl-mod)', width: 1.5 },
  moved: { color: 'var(--rl-mov)', width: 2.5 },
};

function StatusPill({ node, m }: { node: MapNode; m: Messages }) {
  const tag =
    node.status === 'added'
      ? { text: m.map.added, cls: 'rl:text-ins rl:bg-ins-bg' }
      : node.status === 'deleted'
        ? { text: m.map.deleted, cls: 'rl:text-del rl:bg-del-bg' }
        : node.status === 'moved'
          ? { text: m.map.moved, cls: 'rl:text-mov rl:bg-mov-bg' }
          : null;
  const showCount = node.status !== 'added' && node.status !== 'deleted';
  return (
    <span className="rl:flex rl:shrink-0 rl:items-center rl:gap-1.5">
      {tag && <span className={cx('rl:rounded-full rl:px-2 rl:py-0.5 rl:text-[11.5px] rl:font-medium', tag.cls)}>{tag.text}</span>}
      {showCount && (node.count > 0 || !tag) && (
        <span
          className={cx(
            'rl:hidden rl:rounded-full rl:border rl:px-2 rl:py-0.5 rl:text-[11.5px] rl:sm:inline tnum',
            node.count ? 'rl:border-line-strong rl:text-ink-2' : 'rl:border-line rl:text-ink-3',
          )}
        >
          {node.count ? m.map.changes(node.count) : m.map.unchanged}
        </span>
      )}
    </span>
  );
}

function NodeRow({
  node,
  m,
  hovered,
  dimmed,
  active,
  onHover,
  onPick,
}: {
  node: MapNode;
  m: Messages;
  hovered: boolean;
  dimmed: boolean;
  active: boolean;
  onHover: (key: string | null) => void;
  onPick: (node: MapNode) => void;
}) {
  const s = node.section;
  return (
    <li style={{ height: ROW_H }}>
      <button
        type="button"
        onClick={() => onPick(node)}
        onMouseEnter={() => onHover(node.link ?? node.key)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(node.link ?? node.key)}
        onBlur={() => onHover(null)}
        className={cx(
          'rl:flex rl:h-full rl:w-full rl:items-center rl:gap-2.5 rl:rounded-ctl rl:border rl:border-line rl:bg-paper rl:pr-2.5 rl:pl-3.5 rl:text-left',
          'rl:motion-safe:transition-[opacity,background-color] rl:motion-safe:duration-150 rl:hover:bg-hover',
          BAR[node.status],
          hovered && 'rl:bg-hover',
          dimmed && 'rl:opacity-55',
          active && 'rl:outline-2 rl:outline-ink rl:outline-offset-1',
        )}
      >
        <span className="rl:w-9 rl:shrink-0 rl:font-mono rl:text-[12px] rl:text-ink-3 tnum">{s.clause}</span>
        <span className="rl:min-w-0 rl:flex-1 rl:truncate rl:text-[13.5px] rl:font-medium rl:text-ink">{s.title}</span>
        {node.renum && <span className="rl:hidden rl:shrink-0 rl:font-mono rl:text-[11.5px] rl:text-ink-3 rl:md:inline tnum">{node.renum}</span>}
        <StatusPill node={node} m={m} />
      </button>
    </li>
  );
}

/**
 * Clause map: every heading of the original on the left, every heading of the
 * revised version on the right, joined by a line. Crossing green lines are
 * clauses that changed place; colour on a row tells what happened inside it.
 */
export function ClauseMap(props: ViewProps) {
  const { cmp, m, activeId, lang, onNavigate } = props;
  const { leftNodes, rightNodes, links } = useMemo(() => buildMap(cmp, lang), [cmp, lang]);
  const [hover, setHover] = useState<string | null>(null);

  const activeNodes = useMemo(() => {
    const set = new Set<string>();
    const c = cmp.changes.find((x) => x.id === activeId);
    if (!c) return set;
    for (const n of leftNodes) if (c.l.some((i) => i >= n.section.start && i < n.section.end)) set.add(n.key);
    for (const n of rightNodes) if (c.r.some((i) => i >= n.section.start && i < n.section.end)) set.add(n.key);
    return set;
  }, [cmp, activeId, leftNodes, rightNodes]);

  if (!leftNodes.length && !rightNodes.length) {
    return (
      <div className="rl:flex rl:h-full rl:items-center rl:justify-center rl:p-8">
        <div className="rl:flex rl:max-w-[40ch] rl:flex-col rl:items-center rl:gap-3 rl:text-center">
          <TreeStructureIcon size={28} className="rl:text-ink-3" />
          <p className="rl:text-[14px] rl:text-ink-2">{m.map.empty}</p>
        </div>
      </div>
    );
  }

  const rows = Math.max(leftNodes.length, rightNodes.length);
  const height = Math.max(ROW_H, rows * STEP - GAP);
  const y = (i: number) => i * STEP + ROW_H / 2;
  const pick = (n: MapNode) => onNavigate?.('side', undefined, { side: n.side, block: n.section.block });
  const nodeProps = (n: MapNode) => ({
    node: n,
    m,
    hovered: !!hover && (n.link ?? n.key) === hover,
    dimmed: !!hover && (n.link ?? n.key) !== hover,
    active: activeNodes.has(n.key),
    onHover: setHover,
    onPick: pick,
  });

  return (
    <div className="rl-scroll rl:h-full rl:overflow-x-hidden rl:overflow-y-auto rl:bg-canvas">
      <div className="rl:mx-auto rl:w-full rl:max-w-[1120px] rl:px-4 rl:py-6 rl:md:px-8">
        <p className="rl:mb-5 rl:max-w-[72ch] rl:text-[13px] rl:leading-relaxed rl:text-ink-2">{m.map.intro}</p>
        <div className="rl:grid rl:grid-cols-[minmax(0,1fr)_clamp(36px,12vw,150px)_minmax(0,1fr)]">
          <ColumnHead label={m.doc.original} name={cmp.left.name} />
          <span />
          <ColumnHead label={m.doc.revised} name={cmp.right.name} />

          <ul className="rl:flex rl:flex-col" style={{ gap: GAP }}>
            {leftNodes.map((n) => (
              <NodeRow key={n.key} {...nodeProps(n)} />
            ))}
          </ul>
          <svg
            aria-hidden
            className="rl:w-full rl:overflow-visible"
            style={{ height }}
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
          >
            {links.map((ln) => {
              const s = STROKE[ln.status];
              const on = hover === ln.key;
              return (
                <path
                  key={ln.key}
                  d={`M0,${y(ln.from)} C50,${y(ln.from)} 50,${y(ln.to)} 100,${y(ln.to)}`}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={on ? s.width + 1 : s.width}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={hover && !on ? 0.3 : 1}
                  className="rl:motion-safe:transition-opacity rl:motion-safe:duration-150"
                />
              );
            })}
          </svg>
          <ul className="rl:flex rl:flex-col" style={{ gap: GAP }}>
            {rightNodes.map((n) => (
              <NodeRow key={n.key} {...nodeProps(n)} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ColumnHead({ label, name }: { label: string; name: string }) {
  return (
    <div className="rl:mb-3 rl:flex rl:min-w-0 rl:items-baseline rl:gap-2">
      <span className="rl:shrink-0 rl:text-[12.5px] rl:font-semibold rl:text-ink">{label}</span>
      <span className="rl:truncate rl:text-[12.5px] rl:text-ink-3">{name}</span>
    </div>
  );
}
