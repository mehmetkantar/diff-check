import {
  ArrowLeftIcon, ArrowRightIcon, ArticleIcon, BracketsCurlyIcon, ColumnsIcon, DownloadSimpleIcon, FileCsvIcon, FileDocIcon, FilePdfIcon,
  FilesIcon, ListIcon, MicrosoftWordLogoIcon, MoonIcon, PrinterIcon, SlidersHorizontalIcon, SunIcon, TreeStructureIcon,
} from '@phosphor-icons/react';
import type { CompareOptions, Comparison, DocModel, Messages } from '@redline/core';
import type { ReactNode } from 'react';
import type { ViewId } from '../views/types';
import { IconButton } from './IconButton';
import { OcrBadge } from './OcrBadge';
import { Popover } from './Popover';
import { Segmented, type SegmentItem } from './Segmented';

export type ExportKind = 'print' | 'docx' | 'csv' | 'json';

export interface TopBarProps {
  cmp: Comparison;
  m: Messages;
  view: ViewId;
  views: ViewId[];
  hasPdf: boolean;
  onView: (v: ViewId) => void;
  lang: string | null;
  onLang: (l: string | null) => void;
  options: CompareOptions;
  onOptions: (o: CompareOptions) => void;
  blackWhite: boolean;
  onBlackWhite: (v: boolean) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  exports: ExportKind[];
  onExport: (k: ExportKind) => void;
  onBack?: () => void;
  onToggleList: () => void;
  toolbarEnd?: ReactNode;
}

function FileName({ doc, m }: { doc: DocModel; m: Messages }) {
  const Icon = doc.kind === 'pdf' ? FilePdfIcon : FileDocIcon;
  return (
    <span className="rl:flex rl:min-w-0 rl:items-center rl:gap-1.5" title={doc.name}>
      <Icon size={16} aria-hidden="true" className="rl:shrink-0 rl:text-ink-3" />
      <span className="rl:truncate">{doc.name}</span>
      <OcrBadge doc={doc} m={m} />
    </span>
  );
}

const VIEW_ICON: Record<ViewId, ReactNode> = {
  side: <ColumnsIcon size={16} aria-hidden="true" />,
  redline: <ArticleIcon size={16} aria-hidden="true" />,
  map: <TreeStructureIcon size={16} aria-hidden="true" />,
  pages: <FilesIcon size={16} aria-hidden="true" />,
};

const EXPORT_ICON: Record<ExportKind, ReactNode> = {
  print: <PrinterIcon size={17} aria-hidden="true" />,
  docx: <MicrosoftWordLogoIcon size={17} aria-hidden="true" />,
  csv: <FileCsvIcon size={17} aria-hidden="true" />,
  json: <BracketsCurlyIcon size={17} aria-hidden="true" />,
};

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="rl:flex rl:cursor-pointer rl:items-start rl:gap-2.5 rl:rounded-ctl rl:px-2.5 rl:py-2 rl:hover:bg-hover">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rl:mt-[3px] rl:size-4 rl:shrink-0 rl:accent-[var(--rl-ink)]"
      />
      <span className="rl:min-w-0">
        <span className="rl:block rl:text-[13px] rl:leading-snug rl:text-ink">{label}</span>
        {hint && <span className="rl:mt-0.5 rl:block rl:text-[12px] rl:leading-snug rl:text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

export function TopBar(p: TopBarProps) {
  const { cmp, m } = p;
  const viewLabel: Record<ViewId, string> = { side: m.view.sideBySide, redline: m.view.redline, map: m.view.map, pages: m.view.pages };
  const items: SegmentItem<ViewId>[] = p.views.map((v) => ({
    value: v,
    label: viewLabel[v],
    icon: VIEW_ICON[v],
    disabled: v === 'pages' && !p.hasPdf,
    title: v === 'pages' && !p.hasPdf ? m.view.pagesUnavailable : viewLabel[v],
  }));
  const set = <K extends keyof CompareOptions>(k: K, v: CompareOptions[K]) => p.onOptions({ ...p.options, [k]: v });

  return (
    <header className="rl:flex rl:h-14 rl:shrink-0 rl:items-center rl:gap-1 rl:border-b rl:border-line rl:bg-surface rl:px-1.5 rl:sm:gap-2 rl:sm:px-3">
      <IconButton label={m.list.count(cmp.changes.length)} onClick={p.onToggleList} className="rl:lg:hidden">
        <ListIcon size={18} />
      </IconButton>
      {p.onBack && (
        <IconButton label={m.newComparison} onClick={p.onBack} showLabel>
          <ArrowLeftIcon size={17} />
        </IconButton>
      )}
      <div className="rl:hidden rl:min-w-0 rl:flex-1 rl:items-center rl:gap-2 rl:text-[13px] rl:font-medium rl:text-ink rl:md:flex">
        <FileName doc={cmp.left} m={m} />
        <ArrowRightIcon size={14} aria-hidden="true" className="rl:shrink-0 rl:text-ink-3" />
        <FileName doc={cmp.right} m={m} />
      </div>
      <div className="rl:flex-1 rl:md:hidden" />

      <Segmented label={m.view.label} items={items} value={p.view} onChange={p.onView} />

      {cmp.langs && (
        <div className="rl:hidden rl:sm:block">
          <Segmented
            label={m.languageFilter.label}
            items={[
              { value: 'all', label: m.languageFilter.both },
              ...cmp.langs.map((l) => ({ value: l, label: l.toUpperCase(), title: m.langName[l] ?? l })),
            ]}
            value={p.lang ?? 'all'}
            onChange={(v) => p.onLang(v === 'all' ? null : v)}
          />
        </div>
      )}

      <div className="rl:flex rl:items-center rl:gap-0.5">
        <Popover
          label={m.settings}
          width={300}
          trigger={(t) => (
            <IconButton label={m.settings} {...t}>
              <SlidersHorizontalIcon size={18} />
            </IconButton>
          )}
        >
          {() => (
            <div className="rl:space-y-0.5">
              <Check label={m.options.ignoreCase} checked={p.options.ignoreCase} onChange={(v) => set('ignoreCase', v)} />
              <Check label={m.options.ignorePunctuation} checked={p.options.ignorePunctuation} onChange={(v) => set('ignorePunctuation', v)} />
              <Check label={m.options.detectMoves} checked={p.options.detectMoves} onChange={(v) => set('detectMoves', v)} />
              <Check label={m.options.showRenumbering} checked={p.options.showRenumbering} onChange={(v) => set('showRenumbering', v)} />
              <div className="rl:mx-2.5 rl:my-1 rl:border-t rl:border-line" />
              <Check label={m.options.blackWhite} hint={m.options.blackWhiteHint} checked={p.blackWhite} onChange={p.onBlackWhite} />
            </div>
          )}
        </Popover>

        {p.exports.length > 0 && (
          <Popover
            label={m.exportMenu}
            role="menu"
            width={268}
            trigger={(t) => (
              <IconButton label={m.exportMenu} {...t}>
                <DownloadSimpleIcon size={18} />
              </IconButton>
            )}
          >
            {(close) =>
              p.exports.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    p.onExport(k);
                  }}
                  className="rl:flex rl:w-full rl:items-center rl:gap-2.5 rl:rounded-ctl rl:px-2.5 rl:py-2 rl:text-left rl:text-[13px] rl:text-ink rl:hover:bg-hover rl:focus-visible:bg-hover"
                >
                  <span className="rl:text-ink-2">{EXPORT_ICON[k]}</span>
                  {m.exports[k]}
                </button>
              ))
            }
          </Popover>
        )}

        <IconButton label={m.themeToggle} onClick={p.onToggleTheme}>
          {p.theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </IconButton>
        {p.toolbarEnd}
      </div>
    </header>
  );
}
