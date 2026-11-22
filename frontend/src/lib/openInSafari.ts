/**
 * Leaving the installed iOS app for full Safari — docs/features/open-in-safari.md §5.1.
 * In standalone mode iOS opens a link in a window over the app, and closing it
 * stops the music; Safari's own `x-safari-` scheme reaches full Safari instead.
 */
import { isIos, type InstallEnvironment } from './installHint';

/** True on an iPhone or iPad when BookRough runs as the installed app, never in a tab. */
export function isIosStandalone(
  environment: InstallEnvironment,
  matchMedia: ((query: string) => { matches: boolean }) | undefined,
): boolean {
  if (!isIos(environment)) {
    return false;
  }
  return (
    environment.standalone === true || matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/**
 * The address that hands `url` to Safari, or `null` for anything but an
 * http(s) link — the scheme is undocumented by Apple and may stop working (§8).
 */
export function safariUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  return `x-safari-${parsed.href}`;
}

/** How long Safari gets to take over before the app says it didn't (§5.3). */
export const SAFARI_WAIT_MS = 2000;

export const COPIED = 'Link copied. Paste it in Safari.';
export const SAFARI_DID_NOT_OPEN = "Safari didn't open. Try Copy link instead.";

/** The one navigation away from the app; an object so tests can replace it. */
export const browser = {
  open(address: string) {
    window.location.assign(address);
  },
};

/**
 * Hands `address` to Safari and calls `onNotOpened` if the app is still on
 * screen after `SAFARI_WAIT_MS`: the page can't learn otherwise whether the
 * undocumented scheme still works (§5.1). The page losing focus (a system
 * prompt over it) or being hidden counts as a hand-off.
 */
export function openInSafari(address: string, onNotOpened: () => void): void {
  function stopWatching() {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', stopWatching);
    window.removeEventListener('pagehide', stopWatching);
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      stopWatching();
    }
  }
  const timer = setTimeout(() => {
    stopWatching();
    onNotOpened();
  }, SAFARI_WAIT_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', stopWatching);
  window.addEventListener('pagehide', stopWatching);
  browser.open(address);
}
