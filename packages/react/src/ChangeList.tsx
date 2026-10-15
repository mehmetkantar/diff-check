import {
  ArrowBendDownRightIcon, ArrowBendUpLeftIcon, CheckCircleIcon, CircleIcon, EyeSlashIcon, KeyboardIcon, MagnifyingGlassIcon, WarningIcon, XIcon,
} from '@phosphor-icons/react';
import {
  changeKey, describeChange, placeLabel, type Change, type ChangeType, type Comparison, type Flag, type Messages,
} from '@redline/core';
import { memo, useEffect, useId, useMemo, useRef, type Ref } from 'react';
import { changeVisible, typeTone } from './lib/rows';

export interface ChangeFilters {
  /** Empty means every type */
  types: ChangeType[];
  /** Only changes with a flag (figures, legal wording, untranslated edit) */
  attention: boolean;
  /** Hide changes that look like scanning (OCR) mistakes */
  hideOcr: boolean;
  query: string;
}

export const emptyFilters: ChangeFilters = { types: [], attention: false, hideOcr: false, query: '' };

/** OCR-like changes are noise candidates, so they never count as needing attention. */
export const isOcrLike = (c: Change) => c.flags.includes('ocr');
export const needsAttention = (c: Change) => c.flags.length > 0 && !isOcrLike(c);

const lower = (s: string) => s.toLocaleLowerCase('tr');

/** Changes that pass the list filters and the bilingual language filter, in document order. */
export function filterChanges(cmp: Comparison, f: ChangeFilters, lang: string | null, m: Messages): Change[] {
  const q = lower(f.query.trim());
  return cmp.changes.filter((c) => {
    if (!changeVisible(c, lang)) return false;
    if (f.types.length && !f.types.includes(c.type)) return false;
    if (f.attention && !needsAttention(c)) return false;
    if (f.hideOcr && isOcrLike(c)) return false;
    if (!q) return true;
    const hay = [
      describeChange(c, m),
      c.excerpt,
      placeLabel(c.locL, m),
      placeLabel(c.locR, m),
      c.locL?.clause,
      c.locR?.clause,
      c.locL?.title,
      c.locR?.title,
      c.locL?.page ? m.page(c.locL.page) : '',
      c.locR?.page ? m.page(c.locR.page) : '',
      String(c.n),
    ]
      .filter(Boolean)
      .join(' \u0000 ');
    return lower(hay).includes(q);
  });
}

export interface ChangeListProps {
  cmp: Comparison;
  m: Messages;
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Keys from changeKey(change) */
  reviewed: ReadonlySet<string>;
  onToggleReviewed: (key: string) => void;
  filters: ChangeFilters;
  onFiltersChange: (f: ChangeFilters) => void;
  lang?: string | null;
  /** Turns on clause-renumbering reports; the hidden-count note offers it when set */
  onShowRenumbering?: () => void;
  /** Move items: reveal the old (L) or new (R) place */
  onJump?: (changeId: string, side: 'L' | 'R') => void;
  searchRef?: Ref<HTMLInputElement>;
  className?: string;
}

const TYPE_ORDER: ChangeType[] = ['mod', 'ins', 'del', 'move', 'renum'];

/** A tiny sample of each type's mark so the filter chips double as a legend. */
function TypeSample({ type }: { type: ChangeType }) {
  if (type === 'mod') return <span aria-hidden="true" className="bar-mod rl:inline-block rl:h-3.5 rl:w-2 rl:rounded-[1px]" />;
  if (type === 'renum') return <span aria-hidden="true" className="rl:font-mono rl:text-[11px] rl:text-ink-3">#</span>;
  const cls = type === 'ins' ? 'mk-ins' : type === 'del' ? 'mk-del' : 'mk-mdst';
  return (
    <span aria-hidden="true" className={`${cls} rl:font-doc rl:text-[12px] rl:leading-none`}>
      ab
    </span>
  );
}

// Sections are matched by heading title, so a deletion (old numbering) groups with
// its neighbours (new numbering) when the section was renumbered.
function groupKey(c: Change): string {
  const loc = c.locR ?? c.locL;
  if (!loc) return '';
  return loc.title || loc.clause.split(/[.\s(]/)[0];
}

export function ChangeList({
  cmp, m, activeId, onSelect, reviewed, onToggleReviewed, filters, onFiltersChange, lang = null, onShowRenumbering, onJump, searchRef, className = '',
}: ChangeListProps) {
  const searchId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => filterChanges(cmp, filters, lang, m), [cmp, filters, lang, m]);
  const counts = useMemo(() => {
    const out: Record<ChangeType, number> = { mod: 0, ins: 0, del: 0, move: 0, renum: 0 };
    for (const c of cmp.changes) if (changeVisible(c, lang)) out[c.type]++;
    return out;
  }, [cmp, lang]);
  const attention = useMemo(() => cmp.changes.filter((c) => changeVisible(c, lang) && needsAttention(c)).length, [cmp, lang]);
  const ocrLike = useMemo(() => cmp.changes.filter((c) => changeVisible(c, lang) && isOcrLike(c)).length, [cmp, lang]);
  const totalVisible = useMemo(() => cmp.changes.filter((c) => changeVisible(c, lang)).length, [cmp, lang]);
  const doneCount = useMemo(() => cmp.changes.filter((c) => changeVisible(c, lang) && reviewed.has(changeKey(c))).length, [cmp, lang, reviewed]);

  // Runs of consecutive changes in the same section share a sticky header.
  const groups = useMemo(() => {
    const out: { key: string; label: string; title: string; items: Change[] }[] = [];
    for (const c of visible) {
      const key = groupKey(c);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(c);
        continue;
      }
      const loc = c.locR ?? c.locL;
      const top = loc?.clause.split(/[.\s(]/)[0] ?? '';
      out.push({ key, label: top ? m.clause(top) : '', title: loc?.title || (top ? '' : m.list.beforeFirstHeading), items: [c] });
    }
    return out;
  }, [visible, m]);

  useEffect(() => {
    if (!activeId) return;
    listRef.current?.querySelector<HTMLElement>(`[data-change-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const toggleType = (t: ChangeType) =>
    onFiltersChange({ ...filters, types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t] });
  const filtered = filters.types.length > 0 || filters.attention || filters.hideOcr || filters.query.trim() !== '';

  return (
    <aside className={`rl:flex rl:h-full rl:min-h-0 rl:flex-col rl:bg-surface ${className}`} aria-label={m.list.count(totalVisible)}>
      <div className="rl:space-y-3 rl:border-b rl:border-line rl:px-4 rl:pt-4 rl:pb-3">
        <div className="rl:flex rl:items-baseline rl:justify-between rl:gap-3">
          <h2 className="rl:text-[17px] rl:font-semibold rl:tracking-[-0.01em] rl:text-ink">{m.list.count(totalVisible)}</h2>
          {totalVisible > 0 && <span className="tnum rl:text-[12px] rl:text-ink-3">{m.list.progress(doneCount, totalVisible)}</span>}
        </div>

        <div className="rl:flex rl:flex-wrap rl:gap-1.5">
          {TYPE_ORDER.filter((t) => counts[t] > 0).map((t) => {
            const on = filters.types.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={`rl-press rl:flex rl:h-7 rl:items-center rl:gap-1.5 rl:rounded-full rl:border rl:px-2.5 rl:text-[12.5px] rl:font-medium rl:transition-colors ${
                  on ? 'rl:border-ink rl:bg-ink rl:text-paper' : 'rl:border-line rl:bg-paper rl:text-ink-2 rl:hover:border-line-strong rl:hover:text-ink'
                }`}
              >
                <TypeSample type={t} />
                {m.type[t]}
                <span className={`tnum ${on ? 'rl:text-paper/80' : 'rl:text-ink-3'}`}>{counts[t]}</span>
              </button>
            );
          })}
          {attention > 0 && (
            <button
              type="button"
              aria-pressed={filters.attention}
              onClick={() => onFiltersChange({ ...filters, attention: !filters.attention })}
              className={`rl-press rl:flex rl:h-7 rl:items-center rl:gap-1.5 rl:rounded-full rl:border rl:px-2.5 rl:text-[12.5px] rl:font-medium rl:transition-colors ${
                filters.attention ? 'rl:border-ink rl:bg-ink rl:text-paper' : 'rl:border-line rl:bg-paper rl:text-ink-2 rl:hover:border-line-strong rl:hover:text-ink'
              }`}
            >
              <WarningIcon size={13} aria-hidden="true" />
              {m.list.attention}
              <span className={`tnum ${filters.attention ? 'rl:text-paper/80' : 'rl:text-ink-3'}`}>{attention}</span>
            </button>
          )}
          {ocrLike > 0 && (
            <button
              type="button"
              aria-pressed={filters.hideOcr}
              title={m.flagHint.ocr}
              onClick={() => onFiltersChange({ ...filters, hideOcr: !filters.hideOcr })}
              className={`rl-press rl:flex rl:h-7 rl:items-center rl:gap-1.5 rl:rounded-full rl:border rl:border-dashed rl:px-2.5 rl:text-[12.5px] rl:font-medium rl:transition-colors ${
                filters.hideOcr ? 'rl:border-ink rl:bg-ink rl:text-paper' : 'rl:border-line-strong rl:bg-paper rl:text-ink-2 rl:hover:text-ink'
              }`}
            >
              <EyeSlashIcon size={13} aria-hidden="true" />
              {m.list.hideOcr}
              <span className={`tnum ${filters.hideOcr ? 'rl:text-paper/80' : 'rl:text-ink-3'}`}>{ocrLike}</span>
            </button>
          )}
        </div>

        <div className="rl:space-y-1">
          <label htmlFor={searchId} className="rl:block rl:text-[12px] rl:font-medium rl:text-ink-2">
            {m.list.searchLabel}
          </label>
          <div className="rl:relative">
            <MagnifyingGlassIcon size={15} aria-hidden="true" className="rl:pointer-events-none rl:absolute rl:top-1/2 rl:left-2.5 rl:-translate-y-1/2 rl:text-ink-3" />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={filters.query}
              onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
              placeholder={m.list.searchPlaceholder}
              className="rl:h-9 rl:w-full rl:rounded-ctl rl:border rl:border-line-strong rl:bg-paper rl:pr-8 rl:pl-8 rl:text-[13px] rl:text-ink rl:placeholder:text-ink-3 rl:focus:border-ink rl:focus:outline-none"
            />
            {filters.query && (
              <button
                type="button"
                aria-label={m.list.clearFilters}
                onClick={() => onFiltersChange({ ...filters, query: '' })}
                className="rl:absolute rl:top-1/2 rl:right-1.5 rl:flex rl:size-6 rl:-translate-y-1/2 rl:items-center rl:justify-center rl:rounded-[6px] rl:text-ink-3 rl:hover:bg-hover rl:hover:text-ink"
              >
                <XIcon size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div ref={listRef} data-rl-list="" className="rl-scroll rl:min-h-0 rl:flex-1 rl:overflow-y-auto rl:pb-3">
        {cmp.changes.length === 0 ? (
          <div className="rl:px-5 rl:py-10">
            <CheckCircleIcon size={22} className="rl:mb-2 rl:text-ink-3" aria-hidden="true" />
            <p className="rl:text-[14px] rl:font-semibold rl:text-ink">{m.list.noChanges}</p>
            <p className="rl:mt-1 rl:text-[13px] rl:text-ink-2">{m.list.noChangesBody}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rl:px-5 rl:py-10">
            <p className="rl:text-[13px] rl:text-ink-2">{m.list.noMatch}</p>
            {filtered && (
              <button
                type="button"
                onClick={() => onFiltersChange(emptyFilters)}
                className="rl:mt-2 rl:text-[13px] rl:font-medium rl:text-ink rl:underline rl:underline-offset-2"
              >
                {m.list.clearFilters}
              </button>
            )}
          </div>
        ) : (
          groups.map((g, gi) => (
            <section key={`${g.key}-${gi}`} aria-label={[g.label, g.title].filter(Boolean).join(' ')}>
              <h3 className="rl:sticky rl:top-0 rl:z-[1] rl:flex rl:items-baseline rl:gap-2 rl:bg-surface/95 rl:px-4 rl:pt-3 rl:pb-1.5 rl:text-[12px] rl:backdrop-blur-sm">
                {g.label && <span className="tnum rl:shrink-0 rl:font-semibold rl:text-ink">{g.label}</span>}
                <span className="rl:truncate rl:text-ink-2">{g.title}</span>
              </h3>
              <ul className="rl:space-y-0.5 rl:px-2">
                {g.items.map((c) => (
                  <ChangeItem
                    key={c.id}
                    c={c}
                    m={m}
                    bilingual={!!cmp.langs}
                    active={c.id === activeId}
                    done={reviewed.has(changeKey(c))}
                    onSelect={onSelect}
                    onToggleReviewed={onToggleReviewed}
                    onJump={onJump}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="rl:space-y-1.5 rl:border-t rl:border-line rl:px-4 rl:py-3 rl:text-[12px] rl:text-ink-3">
        {cmp.stats.renumHidden > 0 && !cmp.options.showRenumbering && (
          <p className="rl:flex rl:flex-wrap rl:items-baseline rl:gap-x-1.5">
            <span>{m.list.renumHidden(cmp.stats.renumHidden)}</span>
            {onShowRenumbering && (
              <button type="button" onClick={onShowRenumbering} className="rl:font-medium rl:text-ink rl:underline rl:underline-offset-2">
                {m.list.show}
              </button>
            )}
          </p>
        )}
        <p className="rl:hidden rl:items-center rl:gap-1.5 rl:lg:flex">
          <KeyboardIcon size={14} aria-hidden="true" className="rl:shrink-0" />
          {m.list.shortcuts}
        </p>
      </div>
    </aside>
  );
}

interface ItemProps {
  c: Change;
  m: Messages;
  bilingual: boolean;
  active: boolean;
  done: boolean;
  onSelect: (id: string) => void;
  onToggleReviewed: (key: string) => void;
  onJump?: (changeId: string, side: 'L' | 'R') => void;
}

const ChangeItem = memo(function ChangeItem({ c, m, bilingual, active, done, onSelect, onToggleReviewed, onJump }: ItemProps) {
  const tone = typeTone[c.type];
  const from = placeLabel(c.locL, m);
  const to = placeLabel(c.locR, m);
  const where = from && to && from !== to ? `${from} → ${to}` : to || from;
  const pages = [c.locL?.page, c.locR?.page].filter((p): p is number => !!p);
  const page = pages.length === 2 && pages[0] !== pages[1] ? `${m.page(pages[0])} → ${m.page(pages[1])}` : pages.length ? m.page(pages[pages.length - 1]) : '';

  return (
    <li
      data-change-id={c.id}
      className={`rl:group rl:relative rl:rounded-ctl rl:transition-colors ${
        active ? 'rl:bg-paper rl:shadow-pop' : 'rl:hover:bg-hover'
      }`}
    >
      {active && <span aria-hidden="true" className="rl:absolute rl:top-2.5 rl:bottom-2.5 rl:left-0 rl:w-[3px] rl:rounded-full rl:bg-ink" />}
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(c.id)}
        className="rl:block rl:w-full rl:rounded-ctl rl:px-3 rl:pt-2.5 rl:pb-1 rl:text-left"
      >
        <span className="rl:flex rl:items-center rl:gap-2 rl:text-[12px]">
          <span
            className={`tnum rl:flex rl:h-5 rl:min-w-5 rl:items-center rl:justify-center rl:rounded-full rl:border-[1.5px] rl:px-1 rl:text-[10.5px] rl:font-semibold ${tone.border} ${tone.text}`}
          >
            {c.n}
          </span>
          <span className={`rl:font-semibold ${tone.text}`}>{m.type[c.type]}</span>
          {bilingual && c.lang && (
            <span className="rl:rounded-[4px] rl:border rl:border-line-strong rl:px-1 rl:font-mono rl:text-[10px] rl:font-medium rl:text-ink-2">{c.lang.toUpperCase()}</span>
          )}
          <span className="rl:ml-auto rl:flex rl:min-w-0 rl:items-baseline rl:gap-1.5 rl:text-ink-3">
            <span className="rl:truncate">{where}</span>
            {page && <span className="tnum rl:shrink-0 rl:text-[11.5px]">{page}</span>}
          </span>
        </span>
        <span className={`rl:mt-1 rl:line-clamp-3 rl:block rl:text-[13.5px] rl:leading-snug ${done ? 'rl:text-ink-3' : 'rl:text-ink'}`}>
          {describeChange(c, m)}
        </span>
        {c.type === 'move' && c.moveEdited && <span className="rl:mt-0.5 rl:block rl:text-[12px] rl:text-ink-2">{m.movedAndEdited}</span>}
      </button>
      <div className="rl:flex rl:flex-wrap rl:items-center rl:gap-1.5 rl:px-3 rl:pb-2.5">
        {c.flags.map((f: Flag) => (
          <span
            key={f}
            title={m.flagHint[f]}
            className={`rl:rounded-full rl:border rl:px-2 rl:py-px rl:text-[11px] rl:font-medium ${
              f === 'unmirrored'
                ? 'rl:border-del/40 rl:text-del'
                : f === 'ocr'
                  ? 'rl:border-dashed rl:border-line-strong rl:bg-hover rl:text-ink-3'
                  : 'rl:border-line-strong rl:text-ink-2'
            }`}
          >
            {m.flag[f]}
          </span>
        ))}
        {c.type === 'move' && onJump && (
          <>
            <button
              type="button"
              onClick={() => onJump(c.id, 'L')}
              className="rl:flex rl:items-center rl:gap-1 rl:rounded-full rl:border rl:border-line rl:px-2 rl:py-px rl:text-[11px] rl:font-medium rl:text-ink-2 rl:hover:border-mov rl:hover:text-mov"
            >
              <ArrowBendUpLeftIcon size={12} aria-hidden="true" />
              {m.list.oldPlace}
            </button>
            <button
              type="button"
              onClick={() => onJump(c.id, 'R')}
              className="rl:flex rl:items-center rl:gap-1 rl:rounded-full rl:border rl:border-line rl:px-2 rl:py-px rl:text-[11px] rl:font-medium rl:text-ink-2 rl:hover:border-mov rl:hover:text-mov"
            >
              <ArrowBendDownRightIcon size={12} aria-hidden="true" />
              {m.list.newPlace}
            </button>
          </>
        )}
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={m.list.markReviewed}
          title={m.list.markReviewed}
          onClick={() => onToggleReviewed(changeKey(c))}
          className={`rl:ml-auto rl:flex rl:items-center rl:gap-1 rl:rounded-full rl:px-1.5 rl:py-0.5 rl:text-[11.5px] rl:font-medium rl:transition-colors ${
            done ? 'rl:text-ink' : 'rl:text-ink-3 rl:hover:text-ink'
          }`}
        >
          {done ? <CheckCircleIcon size={17} weight="fill" aria-hidden="true" /> : <CircleIcon size={17} aria-hidden="true" />}
          <span className={done ? '' : 'rl:sr-only rl:group-hover:not-sr-only'}>{m.list.reviewed}</span>
        </button>
      </div>
    </li>
  );
});
