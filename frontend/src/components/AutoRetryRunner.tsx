import { useEffect } from 'react';

import { startAutoRetryRunner } from '../stores/autoRetry';

/**
 * Runs the sender's automatic conversion attempts for as long as the app is
 * open, on any screen (conversion-auto-retry.md §5.1). Renders nothing.
 */
export function AutoRetryRunner() {
  useEffect(() => startAutoRetryRunner(), []);
  return null;
}
