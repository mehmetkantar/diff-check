import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface PopoverProps {
  /** Renders the trigger; spread the given props onto a <button>. */
  trigger: (p: { onClick: () => void; 'aria-expanded': boolean; 'aria-controls': string; 'aria-haspopup': 'menu' | 'dialog' }) => ReactNode;
  children: (close: () => void) => ReactNode;
  role?: 'menu' | 'dialog';
  label: string;
  align?: 'start' | 'end';
  width?: number;
}

/** Small anchored panel: closes on outside click, Escape, and returns focus to its trigger. */
export function Popover({ trigger, children, role = 'dialog', label, align = 'end', width = 280 }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
      if (role === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"], input, button')?.focus());
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, role]);

  return (
    <div ref={wrap} className="rl:relative">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-controls': id, 'aria-haspopup': role })}
      {open && (
        <div
          ref={panel}
          id={id}
          role={role}
          aria-label={label}
          style={{ width }}
          className={`rl-fade-in rl:absolute rl:top-[calc(100%+6px)] rl:z-40 rl:rounded-panel rl:border rl:border-line rl:bg-paper rl:p-1.5 rl:shadow-pop ${
            align === 'end' ? 'rl:right-0' : 'rl:left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
