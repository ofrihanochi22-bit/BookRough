import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  /** While false (an action is in flight), the backdrop and Escape do not close it. */
  dismissible?: boolean;
  /** A sheet in steps: a back arrow before the title returns one step (ui-redesign.md §5.0b). */
  onBack?: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * A modal panel: a bottom sheet at phone width, a centred dialog from `sm:` up.
 * Escape and the close button dismiss it; Tab stays inside while it is open;
 * focus returns to whatever opened it.
 */
export function Sheet({ title, onClose, dismissible = true, onBack, children }: SheetProps) {
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

  // Escape is heard on the document, not the panel: focus can drop to <body>
  // when the element holding it disappears (a confirmation closing, say).
  useEffect(() => {
    if (!dismissible) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismissible, onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
      // A dark wash in both schemes (ink is cream in dark mode).
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={close}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="mixtape-sheet-in max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[22px] bg-surface px-6 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-[22px] sm:pb-6"
      >
        <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={!dismissible}
              aria-label="Back"
              className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          )}
          <h2 className="min-w-0 flex-1 font-display text-xl font-bold">{title}</h2>
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
