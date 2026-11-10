import type { ButtonHTMLAttributes } from 'react';

import { useMixtape } from '../../stores/design';

/**
 * By meaning (docs/features/ui-redesign.md §5.0c): `primary` is the screen's
 * one accent pill; `secondary` an outlined pill; `rating` the sticker-yellow
 * pill (yellow means rating throughout the app); `destructive` a soft danger
 * fill. Under the Current design `rating` and `destructive` look like
 * `primary`, as every filled button did before.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'rating' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows an inline spinner, disables the button, and marks it busy. */
  busy?: boolean;
  /**
   * Disabled because the device is offline. Under Mixtape it gets a dashed
   * outline and muted text, so it never reads as a faded-but-working button.
   */
  offline?: boolean;
}

const CURRENT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent',
  secondary: 'border border-line bg-surface text-ink',
  rating: 'bg-accent text-on-accent',
  destructive: 'bg-accent text-on-accent',
};

const MIXTAPE: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent',
  secondary: 'border-[1.5px] border-line text-ink',
  rating: 'bg-sticker text-sticker-ink',
  destructive: 'bg-danger-soft text-danger',
};

const MIXTAPE_OFFLINE = 'border-[1.5px] border-dashed border-line text-muted';

/**
 * The project's one button. Always at least 44×44px (CLAUDE.md §8), and never
 * in an ambiguous state: while `busy` it cannot be pressed again.
 */
export function Button({
  variant = 'primary',
  busy = false,
  offline = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const mixtape = useMixtape();
  const look = mixtape
    ? `font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
        offline ? `${MIXTAPE_OFFLINE} disabled:opacity-100` : MIXTAPE[variant]
      }`
    : `font-medium transition-opacity disabled:opacity-60 ${CURRENT[variant]}`;

  return (
    <button
      type={type}
      disabled={disabled || busy || offline}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm ${look} ${className}`}
      {...rest}
    >
      {busy && (
        <span
          aria-hidden="true"
          className={`size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${mixtape ? 'motion-reduce:animate-none' : ''}`}
        />
      )}
      {children}
    </button>
  );
}
