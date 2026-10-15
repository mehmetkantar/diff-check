import { ScanIcon } from '@phosphor-icons/react';
import type { DocModel, Messages } from '@redline/core';

/** Small marker next to a file name when its text came from OCR (a scan). */
export function OcrBadge({ doc, m }: { doc: DocModel; m: Messages }) {
  if (!doc.ocr) return null;
  return (
    <span
      title={m.doc.ocrHint}
      aria-label={m.doc.ocrHint}
      className="rl:inline-flex rl:shrink-0 rl:items-center rl:gap-0.5 rl:rounded-[4px] rl:border rl:border-dashed rl:border-line-strong rl:px-1 rl:font-mono rl:text-[10px] rl:leading-[15px] rl:font-medium rl:text-ink-2"
    >
      <ScanIcon size={11} aria-hidden="true" />
      {m.doc.ocrBadge}
    </span>
  );
}
