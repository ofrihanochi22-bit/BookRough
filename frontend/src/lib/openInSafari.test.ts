import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USER_AGENTS } from '../test/userAgents';
import type { InstallEnvironment } from './installHint';
import { SAFARI_WAIT_MS, browser, isIosStandalone, openInSafari, safariUrl } from './openInSafari';

const tab = () => ({ matches: false });
const standalone = () => ({ matches: true });

function device(userAgent: string, extra: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return { userAgent, maxTouchPoints: 0, ...extra };
}

describe('isIosStandalone (open-in-safari.md §5.2)', () => {
  it('is true on an iPhone whose navigator says standalone', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: true });

    // Act / Assert
    expect(isIosStandalone(environment, tab)).toBe(true);
  });

  it('is true on an iPhone matching the standalone display mode', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5 });

    // Act / Assert
    expect(isIosStandalone(environment, standalone)).toBe(true);
  });

  it('is true on an iPad, whose installed app reports a Mac user agent', () => {
    // Arrange
    const environment = device(USER_AGENTS.ipadDesktopSafari, { maxTouchPoints: 5 });

    // Act / Assert
    expect(isIosStandalone(environment, standalone)).toBe(true);
  });

  it('is false in an iPhone Safari tab', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: false });

    // Act / Assert
    expect(isIosStandalone(environment, tab)).toBe(false);
  });

  it('is false in an installed app on Android', () => {
    // Act / Assert
    expect(
      isIosStandalone(device(USER_AGENTS.androidChrome, { maxTouchPoints: 5 }), standalone),
    ).toBe(false);
  });

  it('is false in an installed app on the desktop', () => {
    // Act / Assert
    expect(isIosStandalone(device(USER_AGENTS.windowsChrome), standalone)).toBe(false);
    expect(isIosStandalone(device(USER_AGENTS.macSafari), standalone)).toBe(false);
  });

  it('is false when matchMedia is missing and navigator says nothing', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5 });

    // Act / Assert
    expect(isIosStandalone(environment, undefined)).toBe(false);
  });
});

describe('safariUrl (open-in-safari.md §5.1)', () => {
  it('hands an https link to Safari, keeping its query and hash', () => {
    // Act
    const address = safariUrl('https://bandcamp.com/album/x?from=bookrough#t=1');

    // Assert
    expect(address).toBe('x-safari-https://bandcamp.com/album/x?from=bookrough#t=1');
  });

  it('hands an http link to Safari', () => {
    // Act / Assert
    expect(safariUrl('http://example.com/song')).toBe('x-safari-http://example.com/song');
  });

  it('refuses anything that is not an http(s) link', () => {
    // Act / Assert
    expect(safariUrl('mailto:someone@example.com')).toBeNull();
    expect(safariUrl('javascript:alert(1)')).toBeNull();
    expect(safariUrl('not a link')).toBeNull();
  });
});

describe('openInSafari (open-in-safari.md §5.3)', () => {
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    open = vi.spyOn(browser, 'open').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    open.mockRestore();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('navigates to the Safari address', () => {
    // Act
    openInSafari('x-safari-https://bandcamp.com/album/x', vi.fn());

    // Assert
    expect(open).toHaveBeenCalledWith('x-safari-https://bandcamp.com/album/x');
  });

  it('says nothing when the app is hidden before the wait is over', () => {
    // Arrange
    const onNotOpened = vi.fn();
    openInSafari('x-safari-https://bandcamp.com/album/x', onNotOpened);

    // Act
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(SAFARI_WAIT_MS);

    // Assert
    expect(onNotOpened).not.toHaveBeenCalled();
  });

  it('says nothing when a system prompt takes focus', () => {
    // Arrange
    const onNotOpened = vi.fn();
    openInSafari('x-safari-https://bandcamp.com/album/x', onNotOpened);

    // Act
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(SAFARI_WAIT_MS);

    // Assert
    expect(onNotOpened).not.toHaveBeenCalled();
  });

  it('says nothing when the page is hidden through pagehide', () => {
    // Arrange
    const onNotOpened = vi.fn();
    openInSafari('x-safari-https://bandcamp.com/album/x', onNotOpened);

    // Act
    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(SAFARI_WAIT_MS);

    // Assert
    expect(onNotOpened).not.toHaveBeenCalled();
  });

  it('ignores a visibility change that leaves the app on screen', () => {
    // Arrange
    const onNotOpened = vi.fn();
    openInSafari('x-safari-https://bandcamp.com/album/x', onNotOpened);

    // Act
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(SAFARI_WAIT_MS);

    // Assert
    expect(onNotOpened).toHaveBeenCalledOnce();
  });

  it('reports once when the app is still on screen after the wait', () => {
    // Arrange
    const onNotOpened = vi.fn();
    openInSafari('x-safari-https://bandcamp.com/album/x', onNotOpened);

    // Act
    vi.advanceTimersByTime(SAFARI_WAIT_MS - 1);
    const early = onNotOpened.mock.calls.length;
    vi.advanceTimersByTime(1);
    window.dispatchEvent(new Event('blur'));

    // Assert
    expect(early).toBe(0);
    expect(onNotOpened).toHaveBeenCalledOnce();
  });
});
