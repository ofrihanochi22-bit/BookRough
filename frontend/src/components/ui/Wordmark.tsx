/**
 * Placeholder identity: a vinyl mark and the name in the display face. The
 * real logo replaces this component and nothing else.
 */
export function Wordmark() {
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
