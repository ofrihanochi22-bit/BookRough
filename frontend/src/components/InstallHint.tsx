import { useState } from 'react';

import { readDeviceValue, writeDeviceValue } from '../lib/deviceStorage';
import { shouldOfferInstall } from '../lib/installHint';
import { DismissibleBar } from './ui/DismissibleBar';

const DISMISSED_KEY = 'bookrough.installHintDismissed';

function offerInstall(): boolean {
  return shouldOfferInstall(navigator, (query) => window.matchMedia(query));
}

/**
 * "Add to Home Screen" instructions for iPhone and iPad visitors, on the
 * screens a friend lands on in the browser — docs/features/pwa-installable.md §5.1.
 * Never shown inside the installed app; a dismissal is remembered on this device.
 */
export function InstallHint() {
  const [visible, setVisible] = useState(
    () => offerInstall() && readDeviceValue(DISMISSED_KEY) !== '1',
  );

  if (!visible) {
    return null;
  }

  return (
    <DismissibleBar
      role="note"
      dismissLabel="Dismiss install hint"
      onDismiss={() => {
        writeDeviceValue(DISMISSED_KEY, '1');
        setVisible(false);
      }}
      className="mb-6 rounded-xl text-left"
    >
      Install BookRough: tap <strong>Share</strong> (in Safari it&apos;s under •••), then{' '}
      <strong>Add to Home Screen</strong>.
    </DismissibleBar>
  );
}
