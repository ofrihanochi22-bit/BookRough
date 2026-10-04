import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TAGLINE } from '../lib/appSettings';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { makeSession, networkError, resetAuthStore } from '../test/fixtures';
import { AppSettings } from './AppSettings';

const { fetchPublicSettings } = vi.hoisted(() => ({ fetchPublicSettings: vi.fn() }));
vi.mock('../api/settings', () => ({ fetchPublicSettings }));

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthStore();
  useSettingsStore.setState({
    accentColor: 'purple',
    welcomeTagline: DEFAULT_TAGLINE,
    announcement: null,
  });
  delete document.documentElement.dataset.accent;
});

describe('AppSettings', () => {
  it('applies the fetched colour, tagline and announcement', async () => {
    // Arrange
    fetchPublicSettings.mockResolvedValue({
      accentColor: 'green',
      welcomeTagline: 'Music from friends.',
      announcement: { text: 'Hello' },
    });

    // Act
    render(<AppSettings />);

    // Assert
    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('green'));
    expect(useSettingsStore.getState()).toMatchObject({
      welcomeTagline: 'Music from friends.',
      announcement: 'Hello',
    });
  });

  it('keeps the defaults when the fetch fails', async () => {
    // Arrange
    fetchPublicSettings.mockRejectedValue(networkError());

    // Act
    render(<AppSettings />);

    // Assert
    await waitFor(() => expect(fetchPublicSettings).toHaveBeenCalled());
    expect(document.documentElement.dataset.accent).toBe('purple');
    expect(useSettingsStore.getState().welcomeTagline).toBe(DEFAULT_TAGLINE);
  });

  it('falls back to purple for a colour name it does not know', async () => {
    // Arrange
    fetchPublicSettings.mockResolvedValue({ accentColor: 'teal', welcomeTagline: 'x' });

    // Act
    render(<AppSettings />);

    // Assert
    await waitFor(() => expect(useSettingsStore.getState().welcomeTagline).toBe('x'));
    expect(document.documentElement.dataset.accent).toBe('purple');
  });

  it('fetches again when the session changes, for the announcement', async () => {
    // Arrange
    fetchPublicSettings.mockResolvedValue({ accentColor: 'purple', welcomeTagline: 'x' });
    render(<AppSettings />);
    await waitFor(() => expect(fetchPublicSettings).toHaveBeenCalledTimes(1));

    // Act
    act(() => useAuthStore.getState().setSession(makeSession()));

    // Assert
    await waitFor(() => expect(fetchPublicSettings).toHaveBeenCalledTimes(2));
  });
});
