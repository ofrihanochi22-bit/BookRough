import toast from 'react-hot-toast';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { dismissTutorialItem } from '../lib/tutorial';
import { guideSlides, KEYS_HINT, REOPEN_HINT, SWIPE_HINT } from '../lib/tutorialCopy';
import { useAuthStore } from '../stores/auth';

import { GuidePictureView } from './guide/GuidePictures';
import { Button } from './ui/Button';
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
/** A horizontal drag this long (px) turns the slide. */
const SWIPE_DISTANCE = 50;

/** A touch screen reads "Tap" and the swipe hint; a mouse, "Click" and the arrow keys. */
function isTouch(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/**
 * The onboarding guide — docs/features/onboarding-tutorial.md §5.1. Six
 * full-screen slides over the tab screens, each picturing a screen drawn in
 * code with the control to use ringed. Skip, Escape and Get started all close
 * it; Next/Back, swiping and the arrow keys move between slides.
 */
export function Walkthrough({ mode, onClose }: WalkthroughProps) {
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dragStart = useRef<number | null>(null);
  const user = useAuthStore((state) => state.user);
  const service = user?.preferredService ?? null;
  // Read once on open (§5.1): the wording does not flip mid-guide.
  const [touch] = useState(isTouch);
  const slides = useMemo(() => guideSlides({ touch, service }), [touch, service]);
  const last = slides.length - 1;
  const slide = slides[index]!;

  /** `early`: closed by Skip or Escape before the last slide. */
  const close = useCallback(
    (early: boolean) => {
      if (mode === 'first') {
        dismissTutorialItem('walkthrough');
        if (early) {
          toast(REOPEN_HINT);
        }
      }
      onClose();
    },
    [mode, onClose],
  );
  const skip = useCallback(() => close(index < last), [close, index, last]);
  /** The one way slides turn (buttons, swipes, arrow keys): clamped to the first and last. */
  const step = useCallback(
    (by: 1 | -1) => setIndex((current) => Math.min(Math.max(current + by, 0), last)),
    [last],
  );

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  // Escape and the arrow keys are heard on the document, as in Sheet: focus can be on <body>.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        skip();
        return;
      }
      // Alt+Arrow is the browser's back/forward, Ctrl/Meta+Arrow a text move: not ours.
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === 'ArrowRight') {
        step(1);
      } else if (event.key === 'ArrowLeft') {
        step(-1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [skip, step]);

  // Each slide's heading takes focus, so a screen reader reads the new slide.
  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab' && panel.current) {
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
      step(1);
    } else if (distance >= SWIPE_DISTANCE) {
      step(-1);
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
          onClick={skip}
          className="-mr-3 min-h-11 rounded-full px-4 text-sm font-medium text-muted"
        >
          Skip
        </button>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center justify-center gap-4 pt-2 pb-4 text-center">
        {/* The picture shrinks first, and goes on a landscape phone (§6). */}
        <div
          role="img"
          aria-label={slide.label}
          className="flex max-h-80 min-h-0 flex-1 basis-80 justify-center [@media(max-height:480px)]:hidden"
        >
          <div aria-hidden="true" className="flex h-full max-w-[16rem] justify-center">
            <GuidePictureView slide={slide} user={user} />
          </div>
        </div>
        <h2 ref={heading} tabIndex={-1} className={`${MIXTAPE_H1} outline-none`}>
          {slide.title}
        </h2>
        <p className="text-base text-muted">{slide.body}</p>
        {index === 0 && <p className="text-sm text-muted">{touch ? SWIPE_HINT : KEYS_HINT}</p>}
      </div>

      <div className="mx-auto w-full max-w-md">
        <p className="sr-only">
          Step {index + 1} of {slides.length}
        </p>
        {index === last && <p className="mb-3 text-center text-sm text-muted">{REOPEN_HINT}</p>}
        <div aria-hidden="true" className="mb-6 flex justify-center gap-2">
          {slides.map((item, position) => (
            <span
              key={item.title}
              data-current={position === index || undefined}
              className={`size-2 rounded-full ${position === index ? 'bg-accent' : 'bg-line'}`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          {index > 0 && (
            <Button variant="secondary" className="flex-1" onClick={() => step(-1)}>
              Back
            </Button>
          )}
          {index < last ? (
            <Button className="flex-1" onClick={() => step(1)}>
              Next
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => close(false)}>
              Get started
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
