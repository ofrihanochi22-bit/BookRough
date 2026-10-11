import { describe, expect, it } from 'vitest';

import { USER_AGENTS } from '../test/userAgents';
import { shouldOfferInstall, type InstallEnvironment } from './installHint';

const notInstalled = () => ({ matches: false });
const installed = () => ({ matches: true });

function device(userAgent: string, extra: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return { userAgent, maxTouchPoints: 0, ...extra };
}

describe('shouldOfferInstall', () => {
  it('offers in Safari on an iPhone that is not running the installed app', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5 });

    // Act
    const offer = shouldOfferInstall(environment, notInstalled);

    // Assert
    expect(offer).toBe(true);
  });

  it('offers on an iPad, whose Safari reports a Mac user agent', () => {
    // Arrange
    const environment = device(USER_AGENTS.ipadDesktopSafari, { maxTouchPoints: 5 });

    // Act
    const offer = shouldOfferInstall(environment, notInstalled);

    // Assert
    expect(offer).toBe(true);
  });

  it('offers in Chrome on iOS, which also has Add to Home Screen', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneChrome, { maxTouchPoints: 5 });

    // Act
    const offer = shouldOfferInstall(environment, notInstalled);

    // Assert
    expect(offer).toBe(true);
  });

  it("does not offer in Instagram's in-app browser, which cannot install", () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneInstagram, { maxTouchPoints: 5 });

    // Act
    const offer = shouldOfferInstall(environment, notInstalled);

    // Assert
    expect(offer).toBe(false);
  });

  it('does not offer inside the installed app (navigator.standalone)', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: true });

    // Act
    const offer = shouldOfferInstall(environment, notInstalled);

    // Assert
    expect(offer).toBe(false);
  });

  it('does not offer when display-mode is standalone', () => {
    // Arrange
    const environment = device(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5 });

    // Act
    const offer = shouldOfferInstall(environment, installed);

    // Assert
    expect(offer).toBe(false);
  });

  it.each([
    ['desktop Safari on a Mac', USER_AGENTS.macSafari],
    ['Chrome on Android', USER_AGENTS.androidChrome],
    ['Chrome on Windows', USER_AGENTS.windowsChrome],
  ])('does not offer in %s', (_name, userAgent) => {
    // Arrange
    const environment = device(userAgent);

    // Act
    const offer = shouldOfferInstall(environment, notInstalled);

    // Assert
    expect(offer).toBe(false);
  });
});
