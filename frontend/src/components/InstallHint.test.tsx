import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emulateDevice, resetDevice, USER_AGENTS } from '../test/userAgents';
import { InstallHint } from './InstallHint';

const DISMISSED_KEY = 'bookrough.installHintDismissed';

beforeEach(() => {
  window.localStorage.clear();
  emulateDevice(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5 });
});

afterEach(() => {
  resetDevice();
  vi.restoreAllMocks();
});

describe('InstallHint', () => {
  it('shows the instruction and a dismiss button in Safari on an iPhone', () => {
    // Act
    render(<InstallHint />);

    // Assert
    expect(screen.getByRole('note')).toHaveTextContent(
      "Install BookRough: tap Share (in Safari it's under •••), then Add to Home Screen.",
    );
    expect(screen.getByRole('button', { name: 'Dismiss install hint' })).toBeInTheDocument();
  });

  it('hides on dismiss and stays hidden on the next render', async () => {
    // Arrange
    const user = userEvent.setup();
    const { unmount } = render(<InstallHint />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Dismiss install hint' }));
    unmount();
    render(<InstallHint />);

    // Assert
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe('1');
  });

  it('shows nothing when it was already dismissed on this device', () => {
    // Arrange
    window.localStorage.setItem(DISMISSED_KEY, '1');

    // Act
    render(<InstallHint />);

    // Assert
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows nothing inside the installed app', () => {
    // Arrange
    emulateDevice(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: true });

    // Act
    render(<InstallHint />);

    // Assert
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('still shows when storage cannot be read', () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    // Act
    render(<InstallHint />);

    // Assert
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('still hides for this visit when storage cannot be written', async () => {
    // Arrange
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    render(<InstallHint />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Dismiss install hint' }));

    // Assert
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
