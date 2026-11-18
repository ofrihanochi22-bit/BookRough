import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { Button } from './ui/Button';
import { DismissibleBar } from './ui/DismissibleBar';

/**
 * Registers the service worker (production builds only — vite-plugin-pwa's
 * dev mode is off) and offers a Reload when a new version is waiting —
 * docs/features/pwa-offline.md §5.5. ✕ hides it for this launch only, so a
 * draft is never lost to a forced reload and the prompt always comes back.
 */
export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registered) => setRegistration(registered),
    // A newer version than the one dismissed is offered again.
    onNeedRefresh: () => setDismissed(false),
  });

  // An installed iPhone app can sit in the background for days; look for a
  // new version each time it comes back to the foreground. No timer.
  useEffect(() => {
    if (!registration) {
      return;
    }
    function checkForUpdate() {
      if (document.visibilityState === 'visible') {
        void registration?.update().catch(() => {
          // Offline or the server is down; the next foreground tries again.
        });
      }
    }
    document.addEventListener('visibilitychange', checkForUpdate);
    return () => document.removeEventListener('visibilitychange', checkForUpdate);
  }, [registration]);

  if (!needRefresh || dismissed) {
    return null;
  }

  return (
    <DismissibleBar
      role="status"
      dismissLabel="Dismiss update"
      onDismiss={() => setDismissed(true)}
    >
      A new version of BookRough is ready.{' '}
      <Button variant="secondary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </DismissibleBar>
  );
}
