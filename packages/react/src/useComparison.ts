import {
  compareDocs, isParseError, parseDocument, type CompareOptions, type Comparison, type DocModel, type DocumentInput, type OcrProvider,
  type ParseProgress, type Profile,
} from '@redline/core';
import { useEffect, useMemo, useState } from 'react';

export type DocSide = 'original' | 'revised';

export interface ComparisonState {
  status: 'idle' | 'reading' | 'comparing' | 'ready' | 'error';
  comparison: Comparison | null;
  error: { code: string; side?: DocSide } | null;
  /** Set while a scanned page is being recognised (OCR) */
  progress: { side: DocSide; page: number; pages: number } | null;
}

export interface UseComparisonExtras {
  /** OCR engine for scanned PDFs; without one they fail with 'pdf-no-text' */
  ocr?: OcrProvider;
}

/**
 * Parses are shared per input object (and profile and OCR engine), so changing
 * compare options only re-runs the cheap comparison, never the parsing. Each
 * consumer holds a lease; when the last one leaves before the parse finished
 * (inputs changed, viewer unmounted) the parse is aborted, which matters for
 * OCR, where a document can take a minute.
 */
interface Entry {
  promise: Promise<DocModel>;
  controller: AbortController;
  listeners: Set<(p: ParseProgress) => void>;
  last: ParseProgress | null;
  users: number;
  settled: boolean;
}

const cache = new WeakMap<object, Map<Profile | undefined, Map<OcrProvider | undefined, Entry>>>();

function lease(input: DocumentInput, profile: Profile | undefined, ocr: OcrProvider | undefined, onProgress: (p: ParseProgress) => void) {
  const key = input as object;
  let byProfile = cache.get(key);
  if (!byProfile) cache.set(key, (byProfile = new Map()));
  let byOcr = byProfile.get(profile);
  if (!byOcr) byProfile.set(profile, (byOcr = new Map()));
  let entry = byOcr.get(ocr);
  if (!entry) {
    const controller = new AbortController();
    const listeners = new Set<(p: ParseProgress) => void>();
    const created: Entry = {
      controller,
      listeners,
      last: null,
      users: 0,
      settled: false,
      promise: parseDocument(input, {
        profile,
        ocr,
        signal: controller.signal,
        onProgress: (p) => {
          created.last = p;
          listeners.forEach((l) => l(p));
        },
      }),
    };
    const forget = () => {
      if (byOcr!.get(ocr) === created) byOcr!.delete(ocr);
    };
    // A failed or aborted parse must be retryable with the same input.
    created.promise.then(
      () => {
        created.settled = true;
      },
      () => {
        created.settled = true;
        forget();
      },
    );
    entry = created;
    byOcr.set(ocr, entry);
  }
  const e = entry;
  e.users++;
  e.listeners.add(onProgress);
  if (e.last) onProgress(e.last);
  let released = false;
  return {
    promise: e.promise,
    release() {
      if (released) return;
      released = true;
      e.users--;
      e.listeners.delete(onProgress);
      if (!e.settled && e.users === 0) {
        e.controller.abort();
        if (byOcr!.get(ocr) === e) byOcr!.delete(ocr);
      }
    },
  };
}

const errorCode = (e: unknown) => (isParseError(e) ? e.code : 'unknown');

/** Parses and compares two documents; re-compares (without re-parsing) when options change. */
export function useComparison(
  original?: DocumentInput,
  revised?: DocumentInput,
  options?: Partial<CompareOptions>,
  extras: UseComparisonExtras = {},
): ComparisonState {
  const profile = options?.profile;
  const ocr = extras.ocr;
  const [docs, setDocs] = useState<{ a: DocModel; b: DocModel } | null>(null);
  const [state, setState] = useState<ComparisonState>({ status: 'idle', comparison: null, error: null, progress: null });

  useEffect(() => {
    setDocs(null);
    if (!original || !revised) {
      setState({ status: 'idle', comparison: null, error: null, progress: null });
      return;
    }
    let cancelled = false;
    const leases: { release(): void }[] = [];
    setState({ status: 'reading', comparison: null, error: null, progress: null });

    const track = (side: DocSide) => (p: ParseProgress) => {
      if (cancelled) return;
      setState((s) => ({ ...s, progress: p.phase === 'ocr' ? { side, page: p.page, pages: p.pages } : null }));
    };
    const open = (input: DocumentInput, side: DocSide) => {
      const l = lease(input, profile, ocr, track(side));
      leases.push(l);
      return l.promise;
    };
    const fail = (side: DocSide, e: unknown) => {
      if (!cancelled) setState({ status: 'error', comparison: null, error: { code: errorCode(e), side }, progress: null });
    };

    if (ocr) {
      // OCR is slow and usually single-worker: read one file after the other so progress reads clearly.
      (async () => {
        let a: DocModel;
        try {
          a = await open(original, 'original');
        } catch (e) {
          return fail('original', e);
        }
        if (cancelled) return;
        let b: DocModel;
        try {
          b = await open(revised, 'revised');
        } catch (e) {
          return fail('revised', e);
        }
        if (cancelled) return;
        setState((s) => ({ ...s, progress: null }));
        setDocs({ a, b });
      })();
    } else {
      Promise.allSettled([open(original, 'original'), open(revised, 'revised')]).then(([a, b]) => {
        if (cancelled) return;
        if (a.status === 'rejected') fail('original', a.reason);
        else if (b.status === 'rejected') fail('revised', b.reason);
        else setDocs({ a: a.value, b: b.value });
      });
    }
    return () => {
      cancelled = true;
      leases.forEach((l) => l.release());
    };
  }, [original, revised, profile, ocr]);

  // Options usually arrive as fresh object literals; compare them by value.
  const optionsKey = useMemo(() => JSON.stringify({ ...options, profile: undefined }), [options]);

  useEffect(() => {
    if (!docs) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: 'comparing', error: null, progress: null }));
    // Yield one frame so the "Comparing" state can paint before the synchronous diff runs.
    const t = setTimeout(() => {
      if (cancelled) return;
      try {
        const comparison = compareDocs(docs.a, docs.b, { ...(JSON.parse(optionsKey) as Partial<CompareOptions>), profile });
        if (!cancelled) setState({ status: 'ready', comparison, error: null, progress: null });
      } catch {
        if (!cancelled) setState({ status: 'error', comparison: null, error: { code: 'unknown' }, progress: null });
      }
    }, 16);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [docs, optionsKey, profile]);

  return state;
}
