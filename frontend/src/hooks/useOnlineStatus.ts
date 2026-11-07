import { useEffect, useState } from 'react';

import { useAuthStore } from '../stores/auth';

/**
 * Whether the app can reach the server: the browser's online flag, kept
 * current through the online/offline events — and false while the session was
 * opened from the remembered snapshot and the server has not confirmed it yet
 * (docs/features/pwa-offline.md §3.3). Every write control reads this, so an
 * unconfirmed session is read-only.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  const unconfirmed = useAuthStore((state) => state.offline);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online && !unconfirmed;
}
