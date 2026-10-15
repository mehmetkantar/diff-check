import { InfoIcon, XIcon } from '@phosphor-icons/react';
import type { Comparison, Messages, WarningCode } from '@redline/core';
import { useEffect, useState } from 'react';

interface Notice {
  id: string;
  file: string;
  code: WarningCode;
}

/**
 * Calm, non-blocking strip under the top bar for what the reviewer should know
 * about a file (tracked changes, OCR text). Each notice can be dismissed for the
 * rest of the session; a new comparison brings them back.
 */
export function Notices({ cmp, m }: { cmp: Comparison; m: Messages }) {
  const notices: Notice[] = [cmp.left, cmp.right].flatMap((doc) =>
    doc.warnings.map((code) => ({ id: `${doc.id}:${code}`, file: doc.name, code })),
  );
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => setDismissed(new Set()), [cmp.left.id, cmp.right.id]);

  const open = notices.filter((n) => !dismissed.has(n.id));
  if (!open.length) return null;
  return (
    <div className="rl:shrink-0 rl:border-b rl:border-line rl:bg-surface">
      <ul className="rl:divide-y rl:divide-line">
        {open.map((n) => (
          <li key={n.id} className="rl-fade-in rl:flex rl:items-start rl:gap-2 rl:px-4 rl:py-2 rl:text-[12.5px] rl:leading-snug rl:text-ink-2">
            <InfoIcon size={15} aria-hidden="true" className="rl:mt-px rl:shrink-0 rl:text-ink-3" />
            <p className="rl:min-w-0 rl:flex-1">
              <span className="rl:font-medium rl:text-ink">{n.file}</span> {m.warning[n.code]}
            </p>
            <button
              type="button"
              // No dedicated "Dismiss" message yet; "Remove" reads correctly in both bundled locales.
              aria-label={`${m.notice.dismiss}: ${n.file}`}
              title={m.notice.dismiss}
              onClick={() => setDismissed((d) => new Set([...d, n.id]))}
              className="rl:-my-0.5 rl:flex rl:size-6 rl:shrink-0 rl:items-center rl:justify-center rl:rounded-[6px] rl:text-ink-3 rl:hover:bg-hover rl:hover:text-ink"
            >
              <XIcon size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
