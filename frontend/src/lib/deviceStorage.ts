/**
 * Per-device memory: dismissals (the announcement, the install hint) and the
 * remembered session (lib/sessionSnapshot.ts).
 * Storage can be missing or throw (private mode, blocked site data): a read
 * then finds nothing and a write is dropped, so the caller's dismissal lasts
 * for this visit only.
 */
export function readDeviceValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDeviceValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembered for this visit only.
  }
}

export function removeDeviceValue(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to remove when storage is unavailable.
  }
}
