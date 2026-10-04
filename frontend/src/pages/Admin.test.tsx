import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminCommunity, AdminUser } from '../api/admin';
import { App } from '../App';
import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, networkError, resetAuthStore } from '../test/fixtures';

const api = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  listAdminCommunities: vi.fn(),
  fetchSession: vi.fn(),
}));

vi.mock('../api/admin', () => ({
  listAdminUsers: api.listAdminUsers,
  listAdminCommunities: api.listAdminCommunities,
}));
vi.mock('../api/auth', () => ({ fetchSession: api.fetchSession, logout: vi.fn() }));

function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Mia',
    profilePictureUrl: null,
    preferredService: 'TIDAL',
    createdAt: '2026-10-04T09:00:00.000Z',
    onboarded: true,
    isAdmin: false,
    communityCount: 1,
    ...overrides,
  };
}

function adminCommunity(overrides: Partial<AdminCommunity> = {}): AdminCommunity {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Friday Jazz',
    memberCount: 5,
    createdAt: '2026-10-03T09:00:00.000Z',
    owner: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Mia' },
    ...overrides,
  };
}

function signedIn(isAdmin: boolean) {
  useAuthStore.getState().setSession(makeSession({ isAdmin }));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const notFound = () => screen.findByRole('heading', { name: "This page doesn't exist" });

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthStore();
});

describe('who can see the admin area', () => {
  it.each([
    ['a signed-in non-admin', () => signedIn(false)],
    ['a signed-out visitor', () => useAuthStore.getState().clear()],
  ])('shows %s the not-found page, without asking the server', async (_label, arrange) => {
    // Arrange
    arrange();

    // Act
    renderAt('/admin/users');

    // Assert
    expect(await notFound()).toBeInTheDocument();
    expect(api.listAdminUsers).not.toHaveBeenCalled();
  });

  it('sends an admin from /admin to the Users tab', async () => {
    // Arrange
    signedIn(true);
    api.listAdminUsers.mockResolvedValue([adminUser()]);

    // Act
    renderAt('/admin');

    // Assert
    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(await screen.findByText('1 user')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders not-found for an unknown admin path', async () => {
    // Arrange
    signedIn(true);

    // Act
    renderAt('/admin/nothing');

    // Assert
    expect(await notFound()).toBeInTheDocument();
  });
});

describe('Users tab', () => {
  beforeEach(() => signedIn(true));

  it('lists users with their details, badges and the not-finished state', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([
      adminUser({
        id: '33333333-3333-4333-8333-333333333333',
        displayName: null,
        preferredService: null,
        onboarded: false,
        communityCount: 0,
      }),
      adminUser({ isAdmin: true, displayName: 'Boss', communityCount: 2 }),
    ]);

    // Act
    renderAt('/admin/users');

    // Assert
    expect(await screen.findByText('2 users')).toBeInTheDocument();
    expect(screen.getByText('Not finished signing up')).toBeInTheDocument();
    expect(screen.getByText('Joined 4 Oct 2026 · 0 communities')).toBeInTheDocument();
    expect(screen.getByText('Boss')).toBeInTheDocument();
    expect(screen.getByText('Admin', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Tidal · Joined 4 Oct 2026 · 2 communities')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    // Arrange
    api.listAdminUsers.mockReturnValue(new Promise(() => {}));

    // Act
    renderAt('/admin/users');

    // Assert
    expect(screen.getByRole('status', { name: 'Loading users' })).toBeInTheDocument();
  });

  it('offers Try again when loading fails, and reloads', async () => {
    // Arrange
    api.listAdminUsers.mockRejectedValueOnce(networkError()).mockResolvedValue([adminUser()]);
    renderAt('/admin/users');

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('1 user')).toBeInTheDocument();
    expect(api.listAdminUsers).toHaveBeenCalledTimes(2);
  });

  it('turns into not-found and drops the admin flag when the server answers 403', async () => {
    // Arrange
    api.listAdminUsers.mockRejectedValue(httpError(403, "You don't have access to this."));

    // Act
    renderAt('/admin/users');

    // Assert
    await waitFor(() => expect(useAuthStore.getState().isAdmin).toBe(false));
    expect(await notFound()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });
});

describe('Communities tab', () => {
  beforeEach(() => signedIn(true));

  it('lists communities with members, created date and owner', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([
      adminCommunity(),
      adminCommunity({
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Orphans',
        memberCount: 1,
        owner: null,
      }),
    ]);

    // Act
    renderAt('/admin/communities');

    // Assert
    expect(await screen.findByText('2 communities')).toBeInTheDocument();
    expect(screen.getByText('5 members · Created 3 Oct 2026 · Owner: Mia')).toBeInTheDocument();
    expect(screen.getByText('1 member · Created 3 Oct 2026 · No owner')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([]);

    // Act
    renderAt('/admin/communities');

    // Assert
    expect(await screen.findByText('No communities yet.')).toBeInTheDocument();
  });

  it('switches tabs from Users to Communities', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.listAdminCommunities.mockResolvedValue([adminCommunity()]);
    renderAt('/admin/users');
    await screen.findByText('1 user');

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Communities' }));

    // Assert
    expect(await screen.findByText('1 community')).toBeInTheDocument();
  });

  it('offers Try again when loading fails', async () => {
    // Arrange
    api.listAdminCommunities.mockRejectedValue(networkError());

    // Act
    renderAt('/admin/communities');

    // Assert
    expect(await screen.findByText("Couldn't load the communities.")).toBeInTheDocument();
  });
});
