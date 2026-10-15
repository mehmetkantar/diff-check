import { useEffect, useState, type RefObject } from 'react';

export interface RulerTick {
  id: string;
  /** Position and size in the scroller's content coordinates (px) */
  top: number;
  height: number;
  color: string;
  label: string;
}

/**
 * The editor-style overview strip: where every change sits in the whole
 * document, plus the visible window. Clicking a tick selects that change.
 */
export function OverviewRuler({
  scroller,
  ticks,
  activeId,
  onTick,
  label,
}: {
  scroller: RefObject<HTMLElement | null>;
  ticks: RulerTick[];
  activeId: string | null;
  onTick: (id: string) => void;
  label: string;
}) {
  const [view, setView] = useState({ top: 0, height: 0, total: 1 });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      setView({ top: el.scrollTop, height: el.clientHeight, total: Math.max(1, el.scrollHeight) });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scroller]);

  const pct = (v: number) => `${(v / view.total) * 100}%`;

  return (
    <div
      aria-label={label}
      role="group"
      className="rl:absolute rl:top-0 rl:right-0 rl:bottom-0 rl:hidden rl:w-3 rl:border-l rl:border-line rl:bg-surface/70 rl:sm:block"
      onClick={(e) => {
        // Clicking the empty track jumps there.
        const el = scroller.current;
        if (!el || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        el.scrollTo({ top: ((e.clientY - r.top) / r.height) * view.total - el.clientHeight / 2 });
      }}
    >
      <div
        aria-hidden="true"
        className="rl:pointer-events-none rl:absolute rl:inset-x-0 rl:rounded-[2px] rl:bg-ink/10 rl:outline rl:outline-1 rl:outline-ink/15"
        style={{ top: pct(view.top), height: pct(view.height) }}
      />
      {ticks.map((t) => (
        <button
          key={t.id}
          type="button"
          tabIndex={-1}
          title={t.label}
          aria-label={t.label}
          onClick={() => onTick(t.id)}
          className={`rl:absolute rl:left-0.5 rl:right-0.5 rl:min-h-[3px] rl:rounded-[1px] rl:transition-transform rl:hover:scale-x-150 ${
            t.id === activeId ? 'rl:outline rl:outline-[1.5px] rl:outline-ink' : ''
          }`}
          style={{ top: pct(t.top), height: pct(t.height), background: t.color }}
        />
      ))}
    </div>
  );
}
