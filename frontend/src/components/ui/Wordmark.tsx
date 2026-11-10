import { CassetteMark } from './Cassette';

interface WordmarkProps {
  /**
   * The Mixtape logo (docs/features/ui-redesign.md §3.8): `hero` stacks the
   * mark above the word for Welcome, where the word is the page's h1;
   * `compact` sets them in one row for the top-left of every other screen,
   * and is not a heading (the screen keeps its own h1). Without a variant:
   * the Current placeholder, unchanged until each screen's slice places the logo.
   */
  variant?: 'hero' | 'compact';
}

/** The placeholder identity of the Current design: a vinyl mark and the name. */
function CurrentWordmark() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-2xl bg-accent text-on-accent"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.5" opacity="0.5" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
      </div>
      <h1 className="font-display text-3xl font-medium tracking-tight">BookRough</h1>
    </div>
  );
}

/**
 * The app's logo. The mark is decorative; the word is real text, so the logo
 * reads as "BookRough" once. It is not a link and adds no behaviour.
 */
export function Wordmark({ variant }: WordmarkProps) {
  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center gap-3">
        <CassetteMark className="w-[104px]" />
        <h1 className="font-display text-[38px] leading-none font-extrabold tracking-[-0.02em] text-ink">
          BookRough
        </h1>
      </div>
    );
  }
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <CassetteMark className="w-[30px]" />
        <span className="font-display text-lg leading-none font-extrabold tracking-[-0.02em] text-ink">
          BookRough
        </span>
      </div>
    );
  }
  return <CurrentWordmark />;
}
