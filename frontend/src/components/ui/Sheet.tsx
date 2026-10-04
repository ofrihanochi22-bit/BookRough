import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  /** While false (an action is in flight), the backdrop and Escape do not close it. */
  dismissible?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * A modal panel: a bottom sheet at phone width, a centred dialog from `sm:` up.
 * Escape and the close button dismiss it; Tab stays inside while it is open;
 * focus returns to whatever opened it.
 */
export function Sheet({ title, onClose, dismissible = true, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    // The page behind must not scroll while the sheet is open (iPhone drags through).
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  const close = () => {
    if (dismissible) {
      onClose();
    }
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) {
      return;
    }
    const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={close}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-surface px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-6"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-medium">{title}</h2>
          <button
            type="button"
            onClick={close}
            disabled={!dismissible}
            aria-label="Close"
            className="flex size-11 items-center justify-center rounded-full text-muted"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              ×
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
