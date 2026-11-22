import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { COPIED, SAFARI_DID_NOT_OPEN, openInSafari, safariUrl } from '../lib/openInSafari';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

/**
 * "Open in browser?" — asked before an external link opens in the installed
 * iOS app, where iOS's own window would stop the music when closed
 * (docs/features/open-in-safari.md §5.3).
 */
export function OpenInBrowserSheet({ href, onClose }: { href: string; onClose: () => void }) {
  const safari = safariUrl(href);
  const [copyFailed, setCopyFailed] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  function openSafari() {
    if (safari) {
      openInSafari(safari, () => toast.error(SAFARI_DID_NOT_OPEN));
    }
    onClose();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      toast.success(COPIED);
      onClose();
    } catch {
      // No clipboard access: show the link, selected, so it can be copied by hand.
      setCopyFailed(true);
      requestAnimationFrame(() => {
        field.current?.focus();
        field.current?.select();
      });
    }
  }

  return (
    <Sheet title="Open in browser?" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          Open this link in Safari, so the music keeps playing while you use BookRough.
        </p>
        {copyFailed && (
          <div className="flex flex-col gap-2">
            <label htmlFor="open-in-browser-link" className="text-xs text-muted">
              Copy this link and paste it in Safari.
            </label>
            <input
              id="open-in-browser-link"
              ref={field}
              readOnly
              value={href}
              onFocus={(event) => event.target.select()}
              className="min-h-11 rounded-xl border-[1.5px] border-line bg-canvas px-4 text-sm text-ink"
            />
          </div>
        )}
        <div className="flex flex-col gap-3">
          {safari && <Button onClick={openSafari}>Open in Safari</Button>}
          <Button variant={safari ? 'secondary' : 'primary'} onClick={() => void copy()}>
            Copy link
          </Button>
          <Button variant="secondary" onClick={onClose} className="border-transparent">
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
