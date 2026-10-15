import type { Block, Span } from '@redline/core';
import { Fragment, type ReactNode } from 'react';

/** Table cells are joined with "│" by the parsers; draw the separator as a muted rule. */
export function withCells(text: string): ReactNode {
  if (!text.includes('│')) return text;
  const parts = text.split('│');
  return parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <span className="rl-cell-sep" aria-hidden="true">
          │
        </span>
      )}
      {p}
    </Fragment>
  ));
}

/** Clause number followed by the render-model spans, each span styled by its mark class. */
export function BlockText({ block, spans }: { block: Block; spans: Span[] }) {
  return (
    <>
      {block.label && <span className="rl-label rl:mr-1.5">{block.label}</span>}
      {spans.map((s, i) =>
        s.k === 'eq' ? (
          <Fragment key={i}>{withCells(s.text)}</Fragment>
        ) : (
          <span key={i} className={`mk-${s.k}`}>
            {withCells(s.text)}
          </span>
        ),
      )}
    </>
  );
}
