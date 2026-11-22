import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { USER_AGENTS, emulateDevice, resetDevice } from '../test/userAgents';
import { ExternalLink } from './ExternalLink';

function renderLink() {
  render(
    <ExternalLink href="https://bandcamp.com/album/x" className="pill">
      Open in Bandcamp
    </ExternalLink>,
  );
  return screen.getByRole('link', { name: 'Open in Bandcamp' });
}

/** Clicks the link and reports whether the browser's own navigation was cancelled. */
function clickLink(link: HTMLElement): boolean {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => {
    link.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe('ExternalLink (manual-test-fixes-1122.md §5.2)', () => {
  afterEach(() => {
    resetDevice();
  });

  it('opens its address in a new tab, without giving the new page a handle on BookRough', () => {
    // Act
    const link = renderLink();

    // Assert
    expect(link).toHaveAttribute('href', 'https://bandcamp.com/album/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('pill');
  });
});

describe('ExternalLink in the installed iOS app (open-in-safari.md §5.2)', () => {
  afterEach(() => {
    resetDevice();
    vi.unstubAllGlobals();
  });

  it('asks before opening, instead of following the link', async () => {
    // Arrange
    emulateDevice(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: true });
    const link = renderLink();

    // Act
    const prevented = clickLink(link);

    // Assert
    expect(prevented).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Open in browser?' })).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://bandcamp.com/album/x');
  });

  it('closes the question with Cancel and can ask again', async () => {
    // Arrange
    emulateDevice(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: true });
    const link = renderLink();
    await userEvent.click(link);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const closed = screen.queryByRole('dialog', { name: 'Open in browser?' });
    await userEvent.click(link);

    // Assert
    expect(closed).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Open in browser?' })).toBeInTheDocument();
  });

  it('follows the link without asking in an iPhone Safari tab', () => {
    // Arrange
    emulateDevice(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: false });
    const link = renderLink();

    // Act
    const prevented = clickLink(link);

    // Assert
    expect(prevented).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('follows the link without asking in the installed app on Android', () => {
    // Arrange
    emulateDevice(USER_AGENTS.androidChrome, { maxTouchPoints: 5 });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const link = renderLink();

    // Act
    const prevented = clickLink(link);

    // Assert
    expect(prevented).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
