import { ReelCassette } from './Cassette';

interface SpinnerProps {
  /** Announced to screen readers and shown beneath the spinner. */
  label?: string;
}

/**
 * The project's one loading indicator: the cassette with spinning reels
 * (ui-redesign.md §3.7).
 *
 * Every screen that waits on the network uses this rather than rendering an
 * empty area (CLAUDE.md §8: loading is a designed state). It matters most on
 * post submission, where the scrape takes several seconds (CLAUDE.md §7).
 */
export function Spinner({ label = 'Loading…' }: SpinnerProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
      <ReelCassette spinning className="w-20" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
