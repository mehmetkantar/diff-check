import type { ReactNode } from 'react';

export interface SegmentItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Segmented control (radio group semantics). Labels hide below `labelsFrom` and stay as tooltips. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  compact = false,
}: {
  items: SegmentItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="rl:flex rl:items-center rl:rounded-ctl rl:border rl:border-line rl:bg-surface rl:p-0.5">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={it.disabled}
            title={it.title ?? it.label}
            onClick={() => onChange(it.value)}
            className={`rl:flex rl:h-8 rl:items-center rl:gap-1.5 rl:whitespace-nowrap rl:rounded-[6px] rl:px-2 rl:text-[13px] rl:sm:px-2.5 rl:font-medium rl:transition-colors ${
              on ? 'rl:bg-paper rl:text-ink rl:shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'rl:text-ink-2 rl:hover:text-ink'
            } rl:disabled:opacity-40 rl:disabled:hover:text-ink-2`}
          >
            {it.icon}
            <span className={compact ? 'rl:sr-only' : it.icon ? 'rl:hidden rl:xl:inline' : ''}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
