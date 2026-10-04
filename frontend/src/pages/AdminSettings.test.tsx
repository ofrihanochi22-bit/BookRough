import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminSettings } from '../api/settings';
import { App } from '../App';
import { DEFAULT_TAGLINE, SETTINGS_MESSAGES } from '../lib/appSettings';
import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, networkError, resetAuthStore, setOnline } from '../test/fixtures';

const api = vi.hoisted(() => ({
  fetchAdminSettings: vi.fn(),
  updateAdminSettings: vi.fn(),
  fetchPublicSettings: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../api/settings', () => ({
  fetchAdminSettings: api.fetchAdminSettings,
  updateAdminSettings: api.updateAdminSettings,
  fetchPublicSettings: api.fetchPublicSettings,
}));
vi.mock('../api/admin', () => ({ listAdminUsers: vi.fn(), listAdminCommunities: vi.fn() }));
vi.mock('../api/auth', () => ({ fetchSession: vi.fn(), logout: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: api.toastSuccess } }));

function adminSettings(overrides: Partial<AdminSettings> = {}): AdminSettings {
  return {
    settings: {
      announcement: { enabled: false, text: '' },
      accentColor: 'purple',
      welcomeTagline: DEFAULT_TAGLINE,
    },
    changes: [],
    ...overrides,
  };
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/admin/settings']}>
      <App />
    </MemoryRouter>,
  );
}

const saveButton = () => screen.getByRole('button', { name: 'Save changes' });
const bannerText = () => screen.getByLabelText('Banner text');
const tagline = () => screen.getByLabelText('Welcome tagline');

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthStore();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession({ isAdmin: true }));
  api.fetchPublicSettings.mockResolvedValue({ accentColor: 'purple', welcomeTagline: 'x' });
  api.fetchAdminSettings.mockResolvedValue(adminSettings());
});

describe('Settings tab — render', () => {
  it('shows the current values, the empty history, and Save disabled', async () => {
    // Act
    renderSettings();

    // Assert
    expect(await screen.findByText('No changes yet.')).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Purple' })).toBeChecked();
    expect(tagline()).toHaveValue(DEFAULT_TAGLINE);
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
    expect(saveButton()).toBeDisabled();
  });

  it('lists recent changes, including one by a deleted account', async () => {
    // Arrange
    api.fetchAdminSettings.mockResolvedValue(
      adminSettings({
        changes: [
          {
            id: 'c-1',
            key: 'accentColor',
            oldValue: 'purple',
            newValue: 'green',
            changedAt: '2026-10-04T14:02:00.000Z',
            changedBy: null,
          },
        ],
      }),
    );

    // Act
    renderSettings();

    // Assert
    expect(
      await screen.findByText('Deleted account changed the accent colour from Purple to Green'),
    ).toBeInTheDocument();
  });

  it('shows a skeleton, then Try again when loading fails', async () => {
    // Arrange
    api.fetchAdminSettings.mockRejectedValueOnce(networkError()).mockResolvedValue(adminSettings());
    renderSettings();
    expect(screen.getByRole('status', { name: 'Loading settings' })).toBeInTheDocument();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('No changes yet.')).toBeInTheDocument();
  });

  it('turns into not-found when loading answers 403', async () => {
    // Arrange
    api.fetchAdminSettings.mockRejectedValue(httpError(403, "You don't have access to this."));

    // Act
    renderSettings();

    // Assert
    await waitFor(() => expect(useAuthStore.getState().isAdmin).toBe(false));
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });
});

describe('Settings tab — saving', () => {
  it('sends only the colour, toasts, refreshes the history and re-applies the settings', async () => {
    // Arrange
    api.updateAdminSettings.mockResolvedValue(
      adminSettings({
        settings: { ...adminSettings().settings, accentColor: 'green' },
        changes: [
          {
            id: 'c-1',
            key: 'accentColor',
            oldValue: 'purple',
            newValue: 'green',
            changedAt: '2026-10-04T14:02:00.000Z',
            changedBy: { id: 'u', displayName: 'Ofri' },
          },
        ],
      }),
    );
    renderSettings();
    await screen.findByText('No changes yet.');
    const loadsBefore = api.fetchPublicSettings.mock.calls.length;

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Green' }));
    await userEvent.click(saveButton());

    // Assert
    expect(api.updateAdminSettings).toHaveBeenCalledWith({ accentColor: 'green' });
    expect(api.toastSuccess).toHaveBeenCalledWith('Settings saved');
    expect(
      await screen.findByText('Ofri changed the accent colour from Purple to Green'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked();
    expect(saveButton()).toBeDisabled();
    expect(api.fetchPublicSettings.mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it('turns the banner on with cleaned text', async () => {
    // Arrange
    api.updateAdminSettings.mockResolvedValue(adminSettings());
    renderSettings();
    await screen.findByText('No changes yet.');

    // Act
    await userEvent.type(bannerText(), '  Party   tonight ');
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(saveButton());

    // Assert
    expect(api.updateAdminSettings).toHaveBeenCalledWith({
      announcement: { enabled: true, text: 'Party tonight' },
    });
  });

  it('resets the tagline to the default', async () => {
    // Arrange
    api.fetchAdminSettings.mockResolvedValue(
      adminSettings({ settings: { ...adminSettings().settings, welcomeTagline: 'Custom.' } }),
    );
    api.updateAdminSettings.mockResolvedValue(adminSettings());
    renderSettings();
    await screen.findByText('No changes yet.');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    await userEvent.click(saveButton());

    // Assert
    expect(tagline()).toHaveValue(DEFAULT_TAGLINE);
    expect(api.updateAdminSettings).toHaveBeenCalledWith({ welcomeTagline: DEFAULT_TAGLINE });
  });

  it('shows field problems under the fields and keeps Save disabled', async () => {
    // Arrange
    renderSettings();
    await screen.findByText('No changes yet.');

    // Act
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.clear(tagline());

    // Assert
    expect(screen.getByText(SETTINGS_MESSAGES.bannerEmpty)).toBeInTheDocument();
    expect(screen.getByText(SETTINGS_MESSAGES.taglineEmpty)).toBeInTheDocument();
    expect(bannerText()).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();
  });

  it('shows a server failure inline, and Save comes back', async () => {
    // Arrange
    api.updateAdminSettings.mockRejectedValue(httpError(422, 'Choose one of the listed colours.'));
    renderSettings();
    await screen.findByText('No changes yet.');
    await userEvent.click(screen.getByRole('radio', { name: 'Blue' }));

    // Act
    await userEvent.click(saveButton());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose one of the listed colours.');
    expect(saveButton()).toBeEnabled();
    expect(api.toastSuccess).not.toHaveBeenCalled();
  });

  it('turns into not-found when saving answers 403', async () => {
    // Arrange
    api.updateAdminSettings.mockRejectedValue(httpError(403, "You don't have access to this."));
    renderSettings();
    await screen.findByText('No changes yet.');
    await userEvent.click(screen.getByRole('radio', { name: 'Blue' }));

    // Act
    await userEvent.click(saveButton());

    // Assert
    await waitFor(() => expect(useAuthStore.getState().isAdmin).toBe(false));
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });

  it('shows the offline banner and disables Save', async () => {
    // Arrange
    setOnline(false);
    renderSettings();
    await screen.findByText('No changes yet.');

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Pink' }));

    // Assert
    expect(screen.getByText("You're offline. Connect to change settings.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});
