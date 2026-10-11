/**
 * When to offer the "Add to Home Screen" hint — docs/features/pwa-installable.md §5.1.
 * iOS has no install prompt, so the app tells the user; every other platform
 * offers installation in its own UI and gets no hint.
 */

/** The parts of `navigator` the decision reads; Safari adds `standalone`. */
export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  standalone?: boolean;
}

export function isIos({ userAgent, maxTouchPoints }: InstallEnvironment): boolean {
  if (/iPhone|iPod|iPad/.test(userAgent)) {
    return true;
  }
  // iPadOS asks for desktop sites with a Mac user agent; only the touch screen tells it apart.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Safari, Chrome and Firefox on iOS all carry a `Safari/` token; the in-app
 * browsers of Instagram, Facebook and similar apps are bare WebViews without
 * it, and offer no Add to Home Screen.
 */
function isFullBrowser({ userAgent }: InstallEnvironment): boolean {
  return /Safari\//.test(userAgent);
}

/** True in an iOS browser that can install, when the page is not already the installed app. */
export function shouldOfferInstall(
  environment: InstallEnvironment,
  matchMedia: (query: string) => { matches: boolean },
): boolean {
  if (!isIos(environment) || !isFullBrowser(environment)) {
    return false;
  }
  const installed =
    environment.standalone === true || matchMedia('(display-mode: standalone)').matches;
  return !installed;
}
