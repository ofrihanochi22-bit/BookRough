import { CassetteMark } from './Cassette';

interface WordmarkProps {
  /**
   * The logo (docs/features/ui-redesign.md §3.8): `hero` stacks the mark
   * above the word for Welcome, where the word is the page's h1; `compact`
   * sets them in one row for the top-left of every other screen, and is not a
   * heading (the screen keeps its own h1).
   */
  variant: 'hero' | 'compact';
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
  return (
    <div className="flex items-center gap-2">
      <CassetteMark className="w-[30px]" />
      <span className="font-display text-lg leading-none font-extrabold tracking-[-0.02em] text-ink">
        BookRough
      </span>
    </div>
  );
}
