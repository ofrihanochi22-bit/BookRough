import { useState, type MouseEvent, type ReactNode } from 'react';

import { isIosStandalone } from '../lib/openInSafari';
import { OpenInBrowserSheet } from './OpenInBrowserSheet';

interface ExternalLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

/** Read on each tap, not at load (open-in-safari.md §5.2). */
function inInstalledIosApp(): boolean {
  // matchMedia is missing in some embedded engines; then only `standalone` decides.
  return isIosStandalone(navigator, window.matchMedia?.bind(window));
}

/**
 * A link that leaves BookRough, always in a new tab
 * (docs/features/manual-test-fixes-1122.md §5.2). In the installed iOS app it
 * asks first, so the link can go to full Safari and keep playing
 * (docs/features/open-in-safari.md). The only place in the app that writes a
 * raw `<a href>`; `externalLinks.test.ts` keeps it that way.
 */
export function ExternalLink({ href, className, children }: ExternalLinkProps) {
  const [asking, setAsking] = useState(false);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (inInstalledIosApp()) {
      event.preventDefault();
      setAsking(true);
    }
  }

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={handleClick}
      >
        {children}
      </a>
      {asking && <OpenInBrowserSheet href={href} onClose={() => setAsking(false)} />}
    </>
  );
}
