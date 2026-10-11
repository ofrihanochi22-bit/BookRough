/**
 * Deletes the service worker's saved API answers — docs/features/pwa-offline.md §3.4.
 * Run on sign-out and every 401, so the next person on this phone never reads
 * the last one's feed offline. Album art and the app shell hold nothing personal.
 */
export function clearSavedApiAnswers(): void {
  if (typeof caches === 'undefined') {
    return;
  }
  void caches.delete('api').catch(() => {
    // Cache Storage refused (private mode); there is nothing saved to leak.
  });
}
