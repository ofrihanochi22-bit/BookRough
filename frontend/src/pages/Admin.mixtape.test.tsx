import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminSettings } from '../api/settings';
import { App } from '../App';
import { DEFAULT_TAGLINE } from '../lib/appSettings';
import { DESIGN_STORAGE_KEY } from '../lib/design';
import { useAuthStore } from '../stores/auth';
import { useDesignStore } from '../stores/design';
import { makeSession, resetAuthStore, setDesign } from '../test/fixtures';

const api = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  listAdminCommunities: vi.fn(),
  removeUserPhoto: vi.fn(),
  fetchAdminSettings: vi.fn(),
  updateAdminSettings: vi.fn(),
  fetchPublicSettings: vi.fn(),
}));

vi.mock('../api/admin', () => ({
  listAdminUsers: api.listAdminUsers,
  listAdminCommunities: api.listAdminCommunities,
  removeUserPhoto: api.removeUserPhoto,
}));
vi.mock('../api/settings', () => ({
  fetchAdminSettings: api.fetchAdminSettings,
  updateAdminSettings: api.updateAdminSettings,
  fetchPublicSettings: api.fetchPublicSettings,
}));
vi.mock('../api/auth', () => ({ fetchSession: vi.fn(), logout: vi.fn() }));

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Mia',
  profilePictureUrl: null,
  preferredService: 'TIDAL' as const,
  createdAt: '2026-10-04T09:00:00.000Z',
  onboarded: true,
  isAdmin: false,
  communityCount: 1,
};

function settings(overrides: Partial<AdminSettings> = {}): AdminSettings {
  return {
    settings: {
      announcement: { enabled: false, text: '' },
      accentColor: 'green',
      welcomeTagline: DEFAULT_TAGLINE,
    },
    changes: [],
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Every call this screen could make; the switch must make none. */
const apiCalls = () => Object.values(api).reduce((sum, fn) => sum + fn.mock.calls.length, 0);

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthStore();
  window.localStorage.clear();
  api.fetchPublicSettings.mockResolvedValue({
    announcement: '',
    accentColor: 'purple',
    welcomeTagline: DEFAULT_TAGLINE,
  });
  api.listAdminUsers.mockResolvedValue([USER, { ...USER, id: 'u2', displayName: 'Noa' }]);
  api.listAdminCommunities.mockResolvedValue([]);
  api.fetchAdminSettings.mockResolvedValue(settings());
  useAuthStore.getState().setSession(makeSession({ isAdmin: true }));
  setDesign('mixtape');
});

afterEach(() => {
  setDesign('current');
  window.localStorage.clear();
});

describe('Admin under Mixtape (ui-redesign.md §5.17)', () => {
  it('shows the logo, the heading, the design switch and the section tabs on tape', async () => {
    // Act
    renderAt('/admin/users');

    // Assert
    expect(await screen.findByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument();
    const track = screen.getByRole('group', { name: 'Design on this device' });
    expect(within(track).getByRole('button', { name: 'Mixtape' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Only this device. Everyone else sees Current.')).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Admin sections' });
    expect(within(tabs).getByRole('link', { name: 'Users' })).toHaveClass('bg-tape');
    expect(within(tabs).getByRole('link', { name: 'Settings' })).not.toHaveClass('bg-tape');
  });

  it('switching to Current applies at once and is stored on this device only', async () => {
    // Arrange
    renderAt('/admin/users');
    await screen.findByText('Noa');
    expect(document.documentElement.dataset.design).toBe('mixtape');
    const callsBefore = apiCalls();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Current' }));

    // Assert
    expect(document.documentElement.dataset.design).toBeUndefined();
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe('current');
    expect(useDesignStore.getState().design).toBe('current');
    expect(screen.getByRole('button', { name: 'Current' })).toHaveAttribute('aria-pressed', 'true');
    expect(apiCalls()).toBe(callsBefore);
  });

  it('shows the switch under Current too, and choosing Mixtape turns it on', async () => {
    // Arrange
    setDesign('current');
    renderAt('/admin/users');
    await screen.findByText('Noa');
    const callsBefore = apiCalls();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Mixtape' }));

    // Assert
    expect(document.documentElement.dataset.design).toBe('mixtape');
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe('mixtape');
    expect(apiCalls()).toBe(callsBefore);
  });

  it('does not render the switch for a non-admin, who sees the not-found page', async () => {
    // Arrange
    useAuthStore.getState().setSession(makeSession({ isAdmin: false }));

    // Act
    renderAt('/admin/users');

    // Assert
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Design on this device' })).not.toBeInTheDocument();
  });

  it('lists users as one card of divider rows', async () => {
    // Act
    renderAt('/admin/users');

    // Assert
    const list = (await screen.findByText('Noa')).closest('ul');
    expect(list).toHaveClass('divide-y');
    expect(within(list!).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows no communities in the kit empty state', async () => {
    // Act
    renderAt('/admin/communities');

    // Assert
    const empty = await screen.findByText('No communities yet.');
    expect(empty.closest('.border-dashed')).not.toBeNull();
  });

  it('rings the selected accent swatch in ink and shows the history as one card', async () => {
    // Arrange
    api.fetchAdminSettings.mockResolvedValue(
      settings({
        changes: [
          {
            id: 'c1',
            key: 'accentColor',
            oldValue: 'purple',
            newValue: 'green',
            changedAt: '2026-11-01T10:00:00.000Z',
            changedBy: { id: USER.id, displayName: 'Mia' },
          },
        ],
      }),
    );

    // Act
    renderAt('/admin/settings');

    // Assert
    const green = await screen.findByRole('radio', { name: 'Green' });
    const swatch = green.closest('label')!.querySelector('[data-accent]');
    expect(swatch).toHaveClass('ring-ink');
    const purple = screen.getByRole('radio', { name: 'Purple' }).closest('label')!;
    expect(purple.querySelector('[data-accent]')).not.toHaveClass('ring-ink');
    const history = screen.getByRole('region', { name: 'Recent changes' });
    expect(within(history).getByRole('list')).toHaveClass('divide-y');
    expect(screen.getByLabelText('Welcome tagline')).toHaveClass('border-[1.5px]');
  });
});
