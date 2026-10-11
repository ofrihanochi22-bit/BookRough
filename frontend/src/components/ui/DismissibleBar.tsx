import type { ReactNode } from 'react';

interface DismissibleBarProps {
  children: ReactNode;
  /** Accessible name of the × button, e.g. "Dismiss announcement". */
  dismissLabel: string;
  onDismiss: () => void;
  role: 'status' | 'note';
  className?: string;
}

/** A slim accent bar of plain text with a 44 px × button — the announcement and the install hint. */
export function DismissibleBar({
  children,
  dismissLabel,
  onDismiss,
  role,
  className = '',
}: DismissibleBarProps) {
  return (
    <div
      role={role}
      className={`flex items-start gap-2 bg-accent-soft py-2 pr-1 pl-4 text-sm text-accent-ink ${className}`}
    >
      <p className="min-w-0 flex-1 self-center break-words">{children}</p>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={onDismiss}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg leading-none"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
