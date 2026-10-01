import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows an inline spinner, disables the button, and marks it busy. */
  busy?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent',
  secondary: 'border border-line bg-surface text-ink',
};

/**
 * The project's one button. Always at least 44×44px (CLAUDE.md §8), and never
 * in an ambiguous state: while `busy` it cannot be pressed again.
 */
export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-60 ${variants[variant]} ${className}`}
      {...rest}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
