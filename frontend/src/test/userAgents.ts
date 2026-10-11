/**
 * Real user agents for the install-hint tests (docs/features/pwa-installable.md §7),
 * and a helper that makes jsdom's navigator look like a given device.
 */
export const USER_AGENTS = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadDesktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
} as const;

const OVERRIDDEN = ['userAgent', 'maxTouchPoints', 'standalone'] as const;

/** Shadows navigator's own values; `resetDevice` removes the shadows again. */
export function emulateDevice(
  userAgent: string,
  { maxTouchPoints = 0, standalone }: { maxTouchPoints?: number; standalone?: boolean } = {},
): void {
  const values = { userAgent, maxTouchPoints, standalone };
  for (const key of OVERRIDDEN) {
    Object.defineProperty(window.navigator, key, { value: values[key], configurable: true });
  }
}

export function resetDevice(): void {
  for (const key of OVERRIDDEN) {
    delete (window.navigator as unknown as Record<string, unknown>)[key];
  }
}
