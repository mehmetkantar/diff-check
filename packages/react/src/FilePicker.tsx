import { ArrowsDownUpIcon, CaretDownIcon, FileDocIcon, FilePdfIcon, FileIcon, ShieldCheckIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import { acceptedExtensions, type Messages } from '@redline/core';
import { useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { Popover } from './components/Popover';
import { useMessages } from './lib/messages';
import { useResolvedTheme } from './lib/theme';

export interface Sample {
  id: string;
  label: string;
  load: () => Promise<[File, File]>;
}

export interface FilePickerProps {
  onCompare: (original: File, revised: File) => void;
  samples?: Sample[];
  locale?: 'en' | 'tr' | Messages;
  theme?: 'light' | 'dark' | 'system';
  busy?: boolean;
  error?: string | null;
  className?: string;
}

type SlotName = 'original' | 'revised';

function formatSize(bytes: number, locale: string) {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024) return `${fmt.format(bytes / 1024)} KB`;
  return `${fmt.format(bytes / 1024 / 1024)} MB`;
}

/**
 * Two drop zones, original above revised. Dropping both files at once works
 * too: the older file (by modification date) becomes the original.
 */
export function FilePicker({ onCompare, samples, locale, theme = 'system', busy = false, error, className = '' }: FilePickerProps) {
  const m = useMessages(locale);
  const resolved = useResolvedTheme(theme);
  const [files, setFiles] = useState<Record<SlotName, File | null>>({ original: null, revised: null });
  const [localError, setLocalError] = useState<string | null>(null);
  const exts = useMemo(() => acceptedExtensions().split(',').filter(Boolean), []);
  const accept = exts.join(',');

  const validate = (f: File): string | null => {
    const name = f.name.toLowerCase();
    if (exts.some((e) => name.endsWith(e))) return null;
    return name.endsWith('.doc') ? m.error['legacy-doc'] : m.error.unsupported;
  };

  const put = (slot: SlotName, f: File) => {
    const err = validate(f);
    setLocalError(err);
    if (!err) setFiles((s) => ({ ...s, [slot]: f }));
  };

  const putMany = (list: File[]) => {
    const valid = list.filter((f) => !validate(f));
    if (valid.length < 2) {
      if (list[0]) put('original', list[0]);
      return;
    }
    const [a, b] = [...valid].sort((x, y) => x.lastModified - y.lastModified);
    setLocalError(null);
    setFiles({ original: a, revised: b });
  };

  const submit = () => {
    if (!files.original || !files.revised) {
      setLocalError(m.pick.needBoth);
      return;
    }
    setLocalError(null);
    onCompare(files.original, files.revised);
  };

  const shownError = localError ?? error ?? null;

  return (
    <div className={`rl rl:min-h-full rl:bg-canvas ${className}`} data-theme={resolved}>
      <div className="rl:mx-auto rl:max-w-[1180px] rl:px-4 rl:py-10 rl:sm:px-6 rl:lg:py-20">
        <div className="rl:grid rl:items-start rl:gap-10 rl:lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] rl:lg:gap-16">
          <div className="rl:lg:pt-8">
            <h1 className="rl:max-w-[16ch] rl:text-[32px] rl:leading-[1.1] rl:font-semibold rl:tracking-[-0.025em] rl:text-ink rl:sm:text-[42px]">
              {m.pick.title}
            </h1>
            <p className="rl:mt-5 rl:max-w-[44ch] rl:text-[16px] rl:leading-relaxed rl:text-ink-2">{m.pick.lead}</p>
            <p className="rl:mt-8 rl:flex rl:max-w-[44ch] rl:items-start rl:gap-2 rl:text-[13px] rl:leading-snug rl:text-ink-2">
              <ShieldCheckIcon size={18} aria-hidden="true" className="rl:shrink-0 rl:text-ink" />
              {m.pick.privacy}
            </p>
          </div>

          <form
            className="rl:rounded-panel rl:border rl:border-line rl:bg-paper rl:p-4 rl:shadow-pop rl:sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Slot m={m} name="original" label={m.pick.original} file={files.original} accept={accept} onFile={put} onMany={putMany} onClear={() => setFiles((s) => ({ ...s, original: null }))} />
            <div className="rl:relative rl:z-[1] rl:-my-1.5 rl:flex rl:justify-center">
              <button
                type="button"
                aria-label={m.pick.swap}
                title={m.pick.swap}
                disabled={!files.original && !files.revised}
                onClick={() => setFiles((s) => ({ original: s.revised, revised: s.original }))}
                className="rl-press rl:flex rl:size-9 rl:items-center rl:justify-center rl:rounded-full rl:border rl:border-line rl:bg-paper rl:text-ink-2 rl:shadow-pop rl:transition-colors rl:hover:text-ink rl:disabled:opacity-50"
              >
                <ArrowsDownUpIcon size={16} />
              </button>
            </div>
            <Slot m={m} name="revised" label={m.pick.revised} file={files.revised} accept={accept} onFile={put} onMany={putMany} onClear={() => setFiles((s) => ({ ...s, revised: null }))} />

            {shownError && (
              <p role="alert" className="rl:mt-4 rl:text-[13px] rl:leading-snug rl:text-del">
                {shownError}
              </p>
            )}

            <div className="rl:mt-5 rl:flex rl:flex-wrap rl:items-center rl:gap-2.5">
              <button
                type="submit"
                disabled={busy}
                className="rl-press rl:inline-flex rl:h-11 rl:items-center rl:justify-center rl:rounded-ctl rl:bg-ink rl:px-6 rl:text-[14px] rl:font-semibold rl:whitespace-nowrap rl:text-paper rl:transition-opacity rl:hover:opacity-90 rl:disabled:opacity-60"
              >
                {busy ? m.loading.comparing : m.pick.compare}
              </button>
              {samples && samples.length > 0 && (
                <Popover
                  label={m.pick.samples}
                  role="menu"
                  align="start"
                  width={300}
                  trigger={(t) => (
                    <button
                      type="button"
                      {...t}
                      disabled={busy}
                      className="rl-press rl:inline-flex rl:h-11 rl:items-center rl:gap-1.5 rl:rounded-ctl rl:border rl:border-line-strong rl:bg-paper rl:px-4 rl:text-[14px] rl:font-medium rl:whitespace-nowrap rl:text-ink rl:transition-colors rl:hover:bg-hover rl:disabled:opacity-60"
                    >
                      {m.pick.samples}
                      <CaretDownIcon size={14} aria-hidden="true" />
                    </button>
                  )}
                >
                  {(close) =>
                    samples.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="menuitem"
                        onClick={async () => {
                          close();
                          try {
                            const [a, b] = await s.load();
                            setLocalError(null);
                            setFiles({ original: a, revised: b });
                            onCompare(a, b);
                          } catch {
                            setLocalError(m.error.unknown);
                          }
                        }}
                        className="rl:block rl:w-full rl:rounded-ctl rl:px-2.5 rl:py-2 rl:text-left rl:text-[13px] rl:text-ink rl:hover:bg-hover rl:focus-visible:bg-hover"
                      >
                        {s.label}
                      </button>
                    ))
                  }
                </Popover>
              )}
            </div>
          </form>
        </div>

        <section className="rl:mt-14 rl:border-t rl:border-line rl:pt-8 rl:lg:mt-20">
          <h2 className="rl:text-[13px] rl:font-semibold rl:text-ink">{m.pick.legendTitle}</h2>
          <ul className="rl:mt-5 rl:grid rl:grid-cols-1 rl:gap-x-10 rl:gap-y-6 rl:sm:grid-cols-2 rl:lg:grid-cols-5">
            {(
              [
                ['mk-ins', m.legend.ins, m.legend.insHow],
                ['mk-del', m.legend.del, m.legend.delHow],
                ['mk-mdst', m.legend.mdst, m.legend.mdstHow],
                ['mk-msrc', m.legend.msrc, m.legend.msrcHow],
                ['bar-mod', m.legend.mod, m.legend.modHow],
              ] as const
            ).map(([cls, text, how]) => (
              <li key={cls}>
                <span className={`rl-doc rl:text-[16px] ${cls === 'bar-mod' ? 'bar-mod rl:block rl:pl-3' : ''}`}>
                  <span className={cls === 'bar-mod' ? '' : cls}>{text}</span>
                </span>
                <span className={`rl:mt-1.5 rl:block rl:text-[12.5px] rl:text-ink-3 ${cls === 'bar-mod' ? 'rl:pl-3' : ''}`}>{how}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

interface SlotProps {
  m: Messages;
  name: SlotName;
  label: string;
  file: File | null;
  accept: string;
  onFile: (slot: SlotName, f: File) => void;
  onMany: (files: File[]) => void;
  onClear: () => void;
}

function Slot({ m, name, label, file, accept, onFile, onMany, onClear }: SlotProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pdf = file?.name.toLowerCase().endsWith('.pdf');
  const Icon = !file ? FileIcon : pdf ? FilePdfIcon : FileDocIcon;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const list = Array.from(e.dataTransfer.files);
    if (list.length > 1) onMany(list);
    else if (list[0]) onFile(name, list[0]);
  };

  return (
    <div>
      <label htmlFor={id} className="rl:mb-1.5 rl:block rl:text-[12.5px] rl:font-semibold rl:text-ink">
        {label}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`rl:rounded-ctl rl:border-[1.5px] rl:transition-colors rl:focus-within:border-ink ${
          over ? 'rl:border-dashed rl:border-ink rl:bg-hover' : file ? 'rl:border-line rl:bg-surface' : 'rl:border-dashed rl:border-line-strong'
        }`}
      >
        {file ? (
          <div className="rl:flex rl:items-center rl:gap-3 rl:p-3">
            <Icon size={28} aria-hidden="true" className="rl:shrink-0 rl:text-ink-2" />
            <div className="rl:min-w-0 rl:flex-1">
              <p className="rl:truncate rl:text-[13.5px] rl:font-medium rl:text-ink" title={file.name}>
                {file.name}
              </p>
              <p className="tnum rl:flex rl:gap-2 rl:text-[12px] rl:text-ink-3">
                <span>{pdf ? 'PDF' : 'DOCX'}</span>
                <span>{formatSize(file.size, m.locale)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rl:h-8 rl:shrink-0 rl:rounded-ctl rl:px-2.5 rl:text-[12.5px] rl:font-medium rl:whitespace-nowrap rl:text-ink-2 rl:hover:bg-hover rl:hover:text-ink"
            >
              {m.pick.replace}
            </button>
            <button
              type="button"
              aria-label={m.pick.remove}
              title={m.pick.remove}
              onClick={onClear}
              className="rl:flex rl:size-8 rl:shrink-0 rl:items-center rl:justify-center rl:rounded-ctl rl:text-ink-3 rl:hover:bg-hover rl:hover:text-ink"
            >
              <XIcon size={15} />
            </button>
          </div>
        ) : (
          <label htmlFor={id} className="rl:flex rl:min-h-[112px] rl:cursor-pointer rl:flex-col rl:items-center rl:justify-center rl:gap-2 rl:px-4 rl:py-6 rl:text-center">
            <UploadSimpleIcon size={22} aria-hidden="true" className="rl:text-ink-3" />
            <span className="rl:text-[13.5px] rl:leading-snug rl:text-ink-2">
              {m.pick.dropHint} <span className="rl:font-medium rl:text-ink rl:underline rl:underline-offset-2">{m.pick.browse}</span>
            </span>
          </label>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          multiple
          className="rl:sr-only"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            if (list.length > 1) onMany(list);
            else if (list[0]) onFile(name, list[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
