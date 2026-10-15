import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; showLabel?: boolean };

/** Toolbar button: icon with an accessible name; the visible label is optional. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton({ label, children, showLabel, className = '', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={showLabel ? undefined : label}
      title={label}
      className={`rl-press rl:flex rl:h-9 rl:shrink-0 rl:items-center rl:gap-1.5 rl:whitespace-nowrap rl:rounded-ctl rl:px-2 rl:text-[13px] rl:sm:px-2.5 rl:font-medium rl:text-ink-2 rl:transition-colors rl:hover:bg-hover rl:hover:text-ink rl:aria-expanded:bg-hover rl:aria-expanded:text-ink ${className}`}
      {...rest}
    >
      {children}
      {showLabel && <span className="rl:hidden rl:lg:inline">{label}</span>}
    </button>
  );
});
