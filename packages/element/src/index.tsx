/**
 * <redline-viewer>: the Redline document comparison viewer as a framework-free custom element,
 * for hosts built with Angular, Vue, server templates or plain HTML.
 *
 *   <script type="module" src="redline-element.js"></script>
 *   <redline-viewer locale="tr" theme="system" style="height: 100vh"></redline-viewer>
 *   <script type="module">
 *     const viewer = document.querySelector('redline-viewer');
 *     viewer.compare(fileA, fileB);
 *     viewer.addEventListener('redline-select', (e) => console.log(e.detail.change));
 *   </script>
 *
 * Attributes: locale ("en" | "tr"; default: browser language), theme ("light" | "dark" | "system"),
 *             view ("side" | "redline" | "map" | "pages"), fonts ("none" to keep the host's fonts),
 *             ocr-assets (URL of the folder made by `redline-ocr-assets`; turns on in-browser OCR for scans),
 *             ocr-langs (Tesseract languages, default "tur,eng").
 * Properties: original, revised (File | Blob | ArrayBuffer), comparison (a ready Comparison), options, reviewed,
 *             ocr (any OcrProvider; takes precedence over ocr-assets).
 * Events:     redline-select {change}, redline-reviewed {keys}, redline-ready {stats}, redline-error {code, side},
 *             redline-progress {side, page, pages} while scanned pages are recognised.
 */
import type { CompareOptions, Comparison, DocumentInput, OcrProvider } from '@redline/core';
import { createTesseractOcr } from '@redline/ocr';
import { RedlineViewer, useComparison, type ViewId } from '@redline/react';
import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import css from './element.css?inline';
import { ensureFonts } from './fonts';

type Emit = (name: string, detail: unknown) => void;

interface HostProps {
  original?: DocumentInput;
  revised?: DocumentInput;
  comparison?: Comparison;
  options?: Partial<CompareOptions>;
  reviewed?: string[];
  ocr?: OcrProvider;
  locale?: string;
  theme?: 'light' | 'dark' | 'system';
  view?: ViewId;
  onView: (v: ViewId) => void;
  emit: Emit;
}

const VIEWS: ViewId[] = ['side', 'redline', 'map', 'pages'];
const THEMES = ['light', 'dark', 'system'] as const;

function Host({ original, revised, comparison, options, reviewed, ocr, locale, theme, view, onView, emit }: HostProps) {
  const [opts, setOpts] = useState<Partial<CompareOptions> | undefined>(options);
  useEffect(() => setOpts(options), [options]);

  // Same parse cache as the viewer, so the documents are read once; this copy only reports progress.
  const state = useComparison(comparison ? undefined : original, comparison ? undefined : revised, opts, { ocr });
  const ready = comparison ?? state.comparison;
  useEffect(() => {
    if (ready) emit('redline-ready', { stats: ready.stats });
  }, [ready, emit]);
  useEffect(() => {
    if (state.error) emit('redline-error', state.error);
  }, [state.error, emit]);
  useEffect(() => {
    if (state.progress) emit('redline-progress', state.progress);
  }, [state.progress, emit]);

  return (
    <RedlineViewer
      original={comparison ? undefined : original}
      revised={comparison ? undefined : revised}
      comparison={comparison}
      ocr={ocr}
      options={opts}
      onOptionsChange={setOpts}
      locale={locale === 'en' || locale === 'tr' ? locale : undefined}
      theme={theme}
      view={view}
      onViewChange={onView}
      defaultReviewed={reviewed}
      onReviewedChange={(keys) => emit('redline-reviewed', { keys })}
      onChangeSelect={(change) => emit('redline-select', { change })}
      style={{ height: '100%' }}
    />
  );
}

export class RedlineViewerElement extends HTMLElement {
  static observedAttributes = ['locale', 'theme', 'view', 'ocr-assets', 'ocr-langs'];

  #root: Root | null = null;
  #mount: HTMLDivElement | null = null;
  #original?: DocumentInput;
  #revised?: DocumentInput;
  #comparison?: Comparison;
  #options?: Partial<CompareOptions>;
  #reviewed?: string[];
  #ocr?: OcrProvider;
  /** Provider made from the ocr-assets attribute; its worker only starts when a scan needs it. */
  #autoOcr: { key: string; provider: OcrProvider } | null = null;

  connectedCallback() {
    if (this.getAttribute('fonts') !== 'none') ensureFonts();
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = css;
      this.#mount = document.createElement('div');
      this.#mount.className = 'rl-element-root';
      shadow.append(style, this.#mount);
    }
    this.#root ??= createRoot(this.#mount!);
    this.#render();
  }

  disconnectedCallback() {
    this.#root?.unmount();
    this.#root = null;
    void this.#autoOcr?.provider.dispose?.();
    this.#autoOcr = null;
  }

  attributeChangedCallback() {
    this.#render();
  }

  get original() { return this.#original; }
  set original(v: DocumentInput | undefined) { this.#original = v; this.#render(); }

  get revised() { return this.#revised; }
  set revised(v: DocumentInput | undefined) { this.#revised = v; this.#render(); }

  get comparison() { return this.#comparison; }
  set comparison(v: Comparison | undefined) { this.#comparison = v; this.#render(); }

  get options() { return this.#options; }
  set options(v: Partial<CompareOptions> | undefined) { this.#options = v; this.#render(); }

  /** Reviewed change keys to start with (see changeKey in @redline/core). */
  get reviewed() { return this.#reviewed; }
  set reviewed(v: string[] | undefined) { this.#reviewed = v; this.#render(); }

  /** OCR engine for scanned PDFs (any OcrProvider). Overrides the ocr-assets attribute. */
  get ocr() { return this.#ocr ?? this.#autoOcr?.provider; }
  set ocr(v: OcrProvider | undefined) { this.#ocr = v; this.#render(); }

  #resolveOcr(): OcrProvider | undefined {
    if (this.#ocr) return this.#ocr;
    const assets = this.getAttribute('ocr-assets');
    if (!assets) {
      void this.#autoOcr?.provider.dispose?.();
      this.#autoOcr = null;
      return undefined;
    }
    const langs = (this.getAttribute('ocr-langs') ?? 'tur,eng').split(',').map((l) => l.trim()).filter(Boolean);
    const key = `${assets}|${langs.join(',')}`;
    if (this.#autoOcr?.key !== key) {
      void this.#autoOcr?.provider.dispose?.();
      this.#autoOcr = { key, provider: createTesseractOcr({ assetsUrl: assets, langs }) };
    }
    return this.#autoOcr.provider;
  }

  /** Compare two documents (File, Blob or ArrayBuffer). */
  compare(original: DocumentInput, revised: DocumentInput) {
    this.#comparison = undefined;
    this.#original = original;
    this.#revised = revised;
    this.#render();
  }

  #emit: Emit = (name, detail) => {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  };

  #render() {
    if (!this.#root) return;
    const view = this.getAttribute('view');
    const theme = this.getAttribute('theme');
    this.#root.render(
      <Host
        original={this.#original}
        revised={this.#revised}
        comparison={this.#comparison}
        options={this.#options}
        reviewed={this.#reviewed}
        ocr={this.#resolveOcr()}
        locale={this.getAttribute('locale') ?? undefined}
        theme={THEMES.includes(theme as (typeof THEMES)[number]) ? (theme as HostProps['theme']) : undefined}
        view={VIEWS.includes(view as ViewId) ? (view as ViewId) : undefined}
        onView={(v) => this.setAttribute('view', v)}
        emit={this.#emit}
      />,
    );
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('redline-viewer')) {
  customElements.define('redline-viewer', RedlineViewerElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'redline-viewer': RedlineViewerElement;
  }
}
