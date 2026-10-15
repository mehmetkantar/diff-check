import { ArrowLeftIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { Messages } from '@redline/core';

const widths = [92, 78, 96, 64, 88, 72, 95, 58, 84, 90, 70, 80];

function PaperSkeleton({ seed }: { seed: number }) {
  return (
    <div className="rl:rounded-panel rl:bg-paper rl:px-8 rl:py-10 rl:shadow-pop">
      <div className="rl-skeleton rl:mb-6 rl:h-3.5 rl:w-2/5 rl:rounded-full" />
      <div className="rl:space-y-3">
        {widths.map((_, i) => (
          <div key={i} className="rl-skeleton rl:h-2.5 rl:rounded-full" style={{ width: `${widths[(i + seed) % widths.length]}%`, marginTop: i % 4 === 0 && i ? 18 : undefined }} />
        ))}
      </div>
    </div>
  );
}

export interface OcrProgress {
  /** Which file is being recognised, e.g. "Revised: contract-signed.pdf" */
  fileLabel: string;
  page: number;
  pages: number;
}

/** Mirrors the viewer layout so nothing jumps when the comparison arrives. */
export function LoadingState({ m, phase, ocr }: { m: Messages; phase: 'reading' | 'comparing'; ocr?: OcrProgress | null }) {
  const pct = ocr ? Math.min(100, Math.max(0, ((ocr.page - 1) / Math.max(1, ocr.pages)) * 100)) : 0;
  return (
    <div className="rl:flex rl:h-full rl:min-h-0 rl:flex-col">
      <div className="rl:relative rl:flex rl:h-14 rl:shrink-0 rl:items-center rl:gap-3 rl:border-b rl:border-line rl:bg-surface rl:px-4">
        <div className="rl-skeleton rl:size-2.5 rl:shrink-0 rl:rounded-full" />
        <div role="status" aria-live="polite" className="rl:flex rl:min-w-0 rl:items-baseline rl:gap-2 rl:text-[13px]">
          <span className="rl:shrink-0 rl:font-medium rl:text-ink-2">
            {ocr ? m.loading.ocr(ocr.page, ocr.pages) : phase === 'reading' ? m.loading.reading : m.loading.comparing}
          </span>
          {ocr && <span className="rl:truncate rl:text-[12.5px] rl:text-ink-3">{ocr.fileLabel}</span>}
        </div>
        {ocr && (
          // Pages finished so far; a hairline rather than a heavy bar.
          <div
            role="progressbar"
            aria-label={m.loading.ocr(ocr.page, ocr.pages)}
            aria-valuemin={0}
            aria-valuemax={ocr.pages}
            aria-valuenow={ocr.page - 1}
            className="rl:absolute rl:inset-x-0 rl:bottom-[-1px] rl:h-[2px]"
          >
            <div className="rl-progress rl:h-full rl:bg-ink" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="rl:flex rl:min-h-0 rl:flex-1">
        <div className="rl:hidden rl:w-[360px] rl:shrink-0 rl:space-y-4 rl:border-r rl:border-line rl:bg-surface rl:p-4 rl:lg:block">
          <div className="rl-skeleton rl:h-4 rl:w-1/3 rl:rounded-full" />
          <div className="rl:flex rl:gap-1.5">
            {[56, 64, 52, 60].map((w) => (
              <div key={w} className="rl-skeleton rl:h-7 rl:rounded-full" style={{ width: w }} />
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rl:space-y-2 rl:pt-2">
              <div className="rl-skeleton rl:h-2.5 rl:w-1/4 rl:rounded-full" />
              <div className="rl-skeleton rl:h-2.5 rl:rounded-full" style={{ width: `${widths[i + 2]}%` }} />
            </div>
          ))}
        </div>
        <div className="rl:grid rl:min-w-0 rl:flex-1 rl:grid-cols-1 rl:gap-14 rl:overflow-hidden rl:p-6 rl:md:grid-cols-2">
          <PaperSkeleton seed={0} />
          <div className="rl:hidden rl:md:block">
            <PaperSkeleton seed={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ m, code, fileLabel, onBack }: { m: Messages; code: string; fileLabel?: string; onBack?: () => void }) {
  const text = (m.error as Record<string, string>)[code] ?? m.error.unknown;
  return (
    <div className="rl:flex rl:h-full rl:items-start rl:justify-center rl:overflow-auto rl:px-4 rl:py-16">
      <div role="alert" className="rl:w-full rl:max-w-[480px] rl:rounded-panel rl:border rl:border-line rl:bg-paper rl:p-6 rl:shadow-pop">
        <WarningCircleIcon size={26} className="rl:text-del" aria-hidden="true" />
        {fileLabel && <p className="rl:mt-3 rl:text-[12.5px] rl:font-medium rl:text-ink-3">{fileLabel}</p>}
        <p className="rl:mt-1 rl:text-[15px] rl:leading-relaxed rl:text-ink">{text}</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rl-press rl:mt-5 rl:inline-flex rl:h-10 rl:items-center rl:gap-2 rl:rounded-ctl rl:bg-ink rl:px-4 rl:text-[13.5px] rl:font-medium rl:whitespace-nowrap rl:text-paper rl:hover:opacity-90"
          >
            <ArrowLeftIcon size={16} aria-hidden="true" />
            {m.newComparison}
          </button>
        )}
      </div>
    </div>
  );
}

export function IdleState({ m }: { m: Messages }) {
  return (
    <div className="rl:flex rl:h-full rl:items-center rl:justify-center rl:p-8 rl:text-[14px] rl:text-ink-2">
      <p>{m.pick.needBoth}</p>
    </div>
  );
}
