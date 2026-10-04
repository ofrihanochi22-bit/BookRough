import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '../stores/settings';
import { AnnouncementBanner } from './AnnouncementBanner';

function announce(text: string | null) {
  useSettingsStore.setState({ announcement: text });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('AnnouncementBanner', () => {
  it('shows nothing when there is no announcement', () => {
    // Arrange
    announce(null);

    // Act
    render(<AnnouncementBanner />);

    // Assert
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the text literally, markup included', () => {
    // Arrange
    announce('<b>Party</b> tonight');

    // Act
    render(<AnnouncementBanner />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('<b>Party</b> tonight');
  });

  it('stays dismissed for the same text, and returns for a new one', async () => {
    // Arrange
    announce('Maintenance at 22:00');
    const { unmount } = render(<AnnouncementBanner />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));

    // Assert
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();
    render(<AnnouncementBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => announce('New: edit your profile'));
    expect(await screen.findByRole('status')).toHaveTextContent('New: edit your profile');
  });

  it('still shows, and dismisses for the visit, when storage throws', async () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    announce('Hello');
    render(<AnnouncementBanner />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));

    // Assert
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
