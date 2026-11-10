import { Toaster } from 'react-hot-toast';

/**
 * Every toast in the app. A toast is a note on `tape` paper with
 * `tape-ink` text, keeping the library's check / alert icons
 * (docs/features/ui-redesign.md §5.0c); the messages themselves are unchanged.
 */
export function AppToaster() {
  return (
    // Top-centre: clears the notch and stays out from under a thumb.
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: 'var(--tape)',
          color: 'var(--tape-ink)',
          borderRadius: '12px',
          boxShadow: '0 6px 20px rgb(0 0 0 / 0.18)',
        },
      }}
    />
  );
}
