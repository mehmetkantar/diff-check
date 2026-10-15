import { resolveLocale } from '@redline/core';
import { FilePicker, RedlineViewer } from '@redline/react';
import { useEffect, useMemo, useState } from 'react';
import { text, type Lang } from './i18n';
import { ocr } from './ocr';
import { samples } from './samples';
import { storage } from './storage';

type Theme = 'light' | 'dark';

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const initialLang = (): Lang => {
  const saved = storage.get('redline-lang');
  if (saved === 'en' || saved === 'tr') return saved;
  return resolveLocale(navigator.language).locale === 'tr' ? 'tr' : 'en';
};
const initialTheme = (): Theme => {
  const saved = storage.get('redline-theme');
  return saved === 'light' || saved === 'dark' ? saved : systemTheme();
};

/** Identifies a file pair so the review progress survives a reload. */
const pairId = (a: File, b: File) => `redline-reviewed:${a.name}:${a.size}:${a.lastModified}|${b.name}:${b.size}:${b.lastModified}`;

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [files, setFiles] = useState<[File, File] | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);

  useEffect(() => {
    document.documentElement.lang = lang;
    storage.set('redline-lang', lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.set('redline-theme', theme);
  }, [theme]);

  const reviewKey = files ? pairId(files[0], files[1]) : null;
  useEffect(() => {
    if (!reviewKey) return;
    try {
      const saved = JSON.parse(storage.get(reviewKey) ?? '[]');
      setReviewed(Array.isArray(saved) ? saved.filter((k): k is string => typeof k === 'string') : []);
    } catch {
      setReviewed([]);
    }
  }, [reviewKey]);

  const sampleList = useMemo(() => samples(lang), [lang]);

  if (!files) {
    return (
      <div className="rl rl:flex rl:min-h-full rl:flex-col rl:bg-canvas" data-theme={theme}>
        <header className="rl:flex rl:justify-end rl:px-4 rl:pt-3 rl:sm:px-6">
          <AppControls lang={lang} theme={theme} onLang={setLang} onTheme={setTheme} />
        </header>
        <FilePicker className="rl:flex-1" locale={lang} theme={theme} samples={sampleList} onCompare={(a, b) => setFiles([a, b])} />
      </div>
    );
  }

  return (
    <RedlineViewer
      key={reviewKey ?? undefined}
      original={files[0]}
      revised={files[1]}
      ocr={ocr}
      locale={lang}
      theme={theme}
      onThemeChange={setTheme}
      reviewed={reviewed}
      onReviewedChange={(keys) => {
        setReviewed(keys);
        if (reviewKey) storage.set(reviewKey, JSON.stringify(keys));
      }}
      onBack={() => setFiles(null)}
      // The viewer has its own light/dark switch, so only the language goes in the toolbar.
      toolbarEnd={<AppControls lang={lang} onLang={setLang} />}
      style={{ height: '100dvh' }}
    />
  );
}

interface ControlsProps {
  lang: Lang;
  onLang(l: Lang): void;
  theme?: Theme;
  onTheme?(t: Theme): void;
}

/**
 * Interface language (and, on the start screen, theme). The language switch names the other language in
 * that language ("English" / "Türkçe") so it cannot be mistaken for the viewer's document-language filter.
 */
function AppControls({ lang, theme, onLang, onTheme }: ControlsProps) {
  const t = text[lang];
  const other: Lang = lang === 'tr' ? 'en' : 'tr';
  const pill = (active: boolean) =>
    `rl:h-7 rl:px-2.5 rl:rounded-full rl:text-[12.5px] rl:font-medium rl:transition-colors ${
      active ? 'rl:bg-ink rl:text-paper' : 'rl:text-ink-2 rl:hover:bg-hover'
    }`;
  return (
    <div className="rl:flex rl:items-center rl:gap-2">
      <button
        type="button"
        lang={other}
        aria-label={text[other].switchLanguage}
        className="rl:h-8 rl:rounded-full rl:border rl:border-line rl:bg-surface rl:px-3 rl:text-[12.5px] rl:font-medium rl:text-ink-2 rl:transition-colors rl:hover:bg-hover rl:hover:text-ink"
        onClick={() => onLang(other)}
      >
        {text[other].languageName}
      </button>
      {theme && onTheme && (
        <div role="group" aria-label={t.theme} className="rl:flex rl:items-center rl:gap-0.5 rl:rounded-full rl:border rl:border-line rl:bg-surface rl:p-0.5">
          {(['light', 'dark'] as const).map((th) => (
            <button key={th} type="button" aria-pressed={theme === th} className={pill(theme === th)} onClick={() => onTheme(th)}>
              {th === 'light' ? t.light : t.dark}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
