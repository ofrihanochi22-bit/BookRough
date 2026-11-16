import { useEffect, useState } from 'react';

/** How long a load runs before the hint appears (client-cache.md §5.2). */
export const LOADING_HINT_DELAY_MS = 2000;
export const LOADING_HINT_TEXT = 'Still loading. This can take a few seconds.';

/**
 * A quiet line under a skeleton or spinner that has been up for two seconds,
 * so a long wait (a cold start, a slow network) reads as expected rather than
 * broken. Neutral on purpose: at two seconds the two look the same.
 */
export function LoadingHint() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), LOADING_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <p role="status" className="min-h-5 text-center text-sm text-muted">
      {shown ? LOADING_HINT_TEXT : ''}
    </p>
  );
}
