import { Toaster } from 'react-hot-toast';

import { useMixtape } from '../stores/design';

/**
 * Every toast in the app. Under Mixtape a toast is a note on `tape` paper with
 * `tape-ink` text, keeping the library's check / alert icons
 * (docs/features/ui-redesign.md §5.0c); the messages themselves are unchanged.
 */
export function AppToaster() {
  const mixtape = useMixtape();
  return (
    // Top-centre: clears the notch and stays out from under a thumb.
    <Toaster
      position="top-center"
      toastOptions={
        mixtape
          ? {
              style: {
                background: 'var(--tape)',
                color: 'var(--tape-ink)',
                borderRadius: '12px',
                boxShadow: '0 6px 20px rgb(0 0 0 / 0.18)',
              },
            }
          : undefined
      }
    />
  );
}
