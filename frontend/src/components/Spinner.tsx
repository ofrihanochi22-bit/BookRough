interface SpinnerProps {
  /** Announced to screen readers and shown beneath the spinner. */
  label?: string;
}

/**
 * The project's one loading indicator.
 *
 * Every screen that waits on the network uses this rather than rendering an
 * empty area (CLAUDE.md §8: loading is a designed state). It matters most on
 * post submission, where the scrape takes several seconds (CLAUDE.md §7).
 */
export function Spinner({ label = 'Loading…' }: SpinnerProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
      />
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}
