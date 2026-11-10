import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { dismissTutorialItem } from '../lib/tutorial';
import { WALKTHROUGH_CARDS } from '../lib/tutorialCopy';

import { Button } from './ui/Button';
import { ReelCassette } from './ui/Cassette';
import { MIXTAPE_H1 } from './ui/heading';

interface WalkthroughProps {
  /**
   * `first`: shown once per account; closing it is recorded on the server.
   * `replay`: opened from My Profile; closing it records nothing.
   */
  mode: 'first' | 'replay';
  onClose: () => void;
}

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** A horizontal drag this long (px) turns the card. */
const SWIPE_DISTANCE = 50;

/**
 * The onboarding walkthrough — docs/features/onboarding-tutorial.md §5.1.
 * Five full-screen cards over the tab screens. Skip, Escape and Get started
 * all close it; Next/Back, swiping and the arrow keys move between cards.
 */
export function Walkthrough({ mode, onClose }: WalkthroughProps) {
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dragStart = useRef<number | null>(null);
  const last = WALKTHROUGH_CARDS.length - 1;
  const card = WALKTHROUGH_CARDS[index]!;

  const close = useCallback(() => {
    if (mode === 'first') {
      dismissTutorialItem('walkthrough');
    }
    onClose();
  }, [mode, onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  // Escape is heard on the document, as in Sheet: focus can be on <body>.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // Each card's heading takes focus, so a screen reader reads the new card.
  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), last));

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      go(index + 1);
    } else if (event.key === 'ArrowLeft') {
      go(index - 1);
    } else if (event.key === 'Tab' && panel.current) {
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const end = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        end?.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) {
      return;
    }
    const distance = event.clientX - dragStart.current;
    dragStart.current = null;
    if (distance <= -SWIPE_DISTANCE) {
      go(index + 1);
    } else if (distance >= SWIPE_DISTANCE) {
      go(index - 1);
    }
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="How BookRough works"
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        // Touch only: a mouse drag is text selection, not a swipe.
        dragStart.current = event.pointerType === 'mouse' ? null : event.clientX;
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (dragStart.current = null)}
      className="fixed inset-0 z-30 flex flex-col bg-canvas px-6 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-ink"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={close}
          className="-mr-3 min-h-11 rounded-full px-4 text-sm font-medium text-muted"
        >
          Skip
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 text-center">
        <ReelCassette className="w-28" />
        <h2 ref={heading} tabIndex={-1} className={`${MIXTAPE_H1} outline-none`}>
          {card.title}
        </h2>
        <p className="text-base text-muted">{card.body}</p>
      </div>

      <div className="mx-auto w-full max-w-md">
        <p className="sr-only">
          Step {index + 1} of {WALKTHROUGH_CARDS.length}
        </p>
        <div aria-hidden="true" className="mb-6 flex justify-center gap-2">
          {WALKTHROUGH_CARDS.map((item, position) => (
            <span
              key={item.title}
              data-current={position === index || undefined}
              className={`size-2 rounded-full ${position === index ? 'bg-accent' : 'bg-line'}`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          {index > 0 && (
            <Button variant="secondary" className="flex-1" onClick={() => go(index - 1)}>
              Back
            </Button>
          )}
          {index < last ? (
            <Button className="flex-1" onClick={() => go(index + 1)}>
              Next
            </Button>
          ) : (
            <Button className="flex-1" onClick={close}>
              Get started
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
