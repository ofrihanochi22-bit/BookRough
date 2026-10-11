import { readDeviceValue, writeDeviceValue } from './deviceStorage';

/**
 * The service worker's saved API answers (the `api` cache) belong to one user
 * at a time — docs/features/pwa-offline.md §3.4. Album art and the app shell
 * hold nothing personal and are left alone.
 */
const OWNER_KEY = 'bookrough.apiCacheOwner';

function deleteApiCache(): void {
  if (typeof caches === 'undefined') {
    return;
  }
  void caches.delete('api').catch(() => {
    // Cache Storage refused (private mode); there is nothing saved to leak.
  });
}

/** Sign-out and every 401: the next person on this phone never reads this one's feed offline. */
export function clearSavedApiAnswers(): void {
  deleteApiCache();
}

/**
 * On every confirmed session: if the saved answers were collected for someone
 * else, delete them first. This also catches answers a request still in flight
 * at sign-out wrote back after the wipe above.
 */
export function claimSavedApiAnswers(userId: string): void {
  if (readDeviceValue(OWNER_KEY) !== userId) {
    deleteApiCache();
    writeDeviceValue(OWNER_KEY, userId);
  }
}
