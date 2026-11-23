import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminCommunity, AdminUser } from '../api/admin';
import { App } from '../App';
import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, networkError, resetAuthStore } from '../test/fixtures';
import { isolate } from '../lib/bidi';

const api = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  listAdminCommunities: vi.fn(),
  removeUserPhoto: vi.fn(),
  removeAdminCommunityPhoto: vi.fn(),
  fetchUserDeletionPreview: vi.fn(),
  deleteAdminUser: vi.fn(),
  deleteAdminCommunity: vi.fn(),
  fetchAdminOverview: vi.fn(),
  fetchSession: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../api/admin', () => ({
  listAdminUsers: api.listAdminUsers,
  listAdminCommunities: api.listAdminCommunities,
  removeUserPhoto: api.removeUserPhoto,
  removeAdminCommunityPhoto: api.removeAdminCommunityPhoto,
  fetchUserDeletionPreview: api.fetchUserDeletionPreview,
  deleteAdminUser: api.deleteAdminUser,
  deleteAdminCommunity: api.deleteAdminCommunity,
  fetchAdminOverview: api.fetchAdminOverview,
}));
vi.mock('react-hot-toast', () => ({
  default: { success: api.toastSuccess, error: api.toastError },
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
    photoUrl: null,
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

  it('sends an admin from /admin to the Overview tab, listed first', async () => {
    // Arrange — the Overview's request never settles; only the landing matters here.
    signedIn(true);
    api.fetchAdminOverview.mockReturnValue(new Promise(() => {}));

    // Act
    renderAt('/admin');

    // Assert (docs/features/admin-overview.md §5)
    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Admin sections' }))
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(tabs).toEqual(['Overview', 'Users', 'Communities', 'Settings']);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(api.fetchAdminOverview).toHaveBeenCalled();
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
    expect(
      screen.getByText(`5 members · Created 3 Oct 2026 · Owner: ${isolate('Mia')}`),
    ).toBeInTheDocument();
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

/** The one write on users — docs/features/avatar-upload.md §5.2. */
describe('Users tab — Remove photo', () => {
  const PHOTO = '/api/users/11111111-1111-4111-8111-111111111111/avatar?v=1';

  beforeEach(() => signedIn(true));

  it('confirms, removes the photo, updates the row and toasts', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser({ profilePictureUrl: PHOTO })]);
    api.removeUserPhoto.mockResolvedValue(adminUser({ profilePictureUrl: null }));
    renderAt('/admin/users');

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));
    const sheet = screen.getByRole('dialog', { name: 'Remove photo?' });
    expect(
      within(sheet).getByText("Remove Mia's photo? They'll see their initials instead."),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove photo' }));

    // Assert
    expect(api.removeUserPhoto).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(api.toastSuccess).toHaveBeenCalledWith('Photo removed');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('offers nothing for a user without a photo', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);

    // Act
    renderAt('/admin/users');

    // Assert
    expect(await screen.findByText('Mia')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('toasts the server message and keeps the sheet when removing fails', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser({ profilePictureUrl: PHOTO })]);
    api.removeUserPhoto.mockRejectedValue(httpError(404, 'User not found.'));
    renderAt('/admin/users');

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));
    const sheet = screen.getByRole('dialog', { name: 'Remove photo?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove photo' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith('User not found.');
    expect(screen.getByRole('dialog', { name: 'Remove photo?' })).toBeInTheDocument();
  });
});

/** docs/features/community-photo.md §5.4. */
describe('Communities tab — Remove photo', () => {
  const PHOTO = '/api/communities/22222222-2222-4222-8222-222222222222/photo?v=1';

  beforeEach(() => signedIn(true));

  it('confirms, removes the photo, updates the row and toasts', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([adminCommunity({ photoUrl: PHOTO })]);
    api.removeAdminCommunityPhoto.mockResolvedValue(adminCommunity({ photoUrl: null }));
    renderAt('/admin/communities');

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));
    const sheet = screen.getByRole('dialog', { name: 'Remove photo?' });
    expect(
      within(sheet).getByText(
        `Remove ${isolate('Friday Jazz')}'s photo? Its members will see the generated cover instead.`,
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove photo' }));

    // Assert
    expect(api.removeAdminCommunityPhoto).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(api.toastSuccess).toHaveBeenCalledWith('Photo removed');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('offers nothing for a community without a photo', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([adminCommunity()]);

    // Act
    renderAt('/admin/communities');

    // Assert
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('toasts the server message and keeps the sheet when removing fails', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([adminCommunity({ photoUrl: PHOTO })]);
    api.removeAdminCommunityPhoto.mockRejectedValue(httpError(404, 'Community not found.'));
    renderAt('/admin/communities');

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));
    const sheet = screen.getByRole('dialog', { name: 'Remove photo?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove photo' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith('Community not found.');
    expect(screen.getByRole('dialog', { name: 'Remove photo?' })).toBeInTheDocument();
  });
});

/** docs/features/admin-delete.md §5 and §7 (component scenarios). */
describe('Users tab — Delete', () => {
  const MIA_ID = '11111111-1111-4111-8111-111111111111';
  const PREVIEW = {
    displayName: 'Mia',
    counts: { posts: 12, ratings: 30, comments: 8 },
    communities: [
      {
        id: 'c-jazz',
        name: 'Jazz',
        outcome: 'TRANSFER' as const,
        newOwner: { id: 'u-ada', displayName: 'Ada' },
      },
      { id: 'c-solo', name: 'Solo', outcome: 'DELETE' as const },
    ],
  };

  beforeEach(() => signedIn(true));

  async function openDialog() {
    renderAt('/admin/users');
    const row = (await screen.findByText('Mia')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    return screen.getByRole('dialog', { name: 'Are you sure?' });
  }

  it('shows Delete on a user row and not on an admin row', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([
      adminUser(),
      adminUser({ id: 'admin-id', displayName: 'Boss', isAdmin: true }),
    ]);

    // Act
    renderAt('/admin/users');

    // Assert
    const mia = (await screen.findByText('Mia')).closest('li')!;
    const boss = screen.getByText('Boss').closest('li')!;
    expect(within(mia).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(boss).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it("opens 'Are you sure?' with the preview's counts and the per-community lines", async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview.mockResolvedValue(PREVIEW);

    // Act
    const sheet = await openDialog();

    // Assert
    expect(await within(sheet).findByText(/everything they posted/)).toHaveTextContent(
      "Delete Mia and everything they posted? 12 posts, 30 ratings and 8 comments will be deleted, including replies others wrote under them. This can't be undone.",
    );
    expect(
      within(sheet)
        .getByText(/passes to/)
        .closest('li'),
    ).toHaveTextContent('Jazz passes to Ada.');
    expect(
      within(sheet)
        .getByText(/will be deleted\.$/)
        .closest('li'),
    ).toHaveTextContent('Solo will be deleted.');
    expect(api.fetchUserDeletionPreview).toHaveBeenCalledWith(MIA_ID);
  });

  it('keeps the confirm button unavailable while the preview loads', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview.mockReturnValue(new Promise(() => {}));

    // Act
    const sheet = await openDialog();

    // Assert
    expect(within(sheet).getByRole('status')).toHaveTextContent('Loading what will be deleted');
    expect(within(sheet).getByRole('button', { name: 'Delete user' })).toBeDisabled();
  });

  it('closes on Cancel and on Escape without deleting', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview.mockResolvedValue(PREVIEW);

    // Act
    let sheet = await openDialog();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const row = screen.getByText('Mia').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    sheet = screen.getByRole('dialog', { name: 'Are you sure?' });
    await within(sheet).findByText(/everything they posted/);
    await userEvent.keyboard('{Escape}');

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.deleteAdminUser).not.toHaveBeenCalled();
  });

  it('deletes on confirm, removes the row and toasts', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview.mockResolvedValue(PREVIEW);
    api.deleteAdminUser.mockResolvedValue(undefined);
    const sheet = await openDialog();
    await within(sheet).findByText(/everything they posted/);

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete user' }));

    // Assert
    expect(api.deleteAdminUser).toHaveBeenCalledWith(MIA_ID);
    expect(api.toastSuccess).toHaveBeenCalledWith('Mia was deleted.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Mia')).not.toBeInTheDocument();
    expect(screen.getByText('0 users')).toBeInTheDocument();
  });

  it('shows a preview error inline with Retry, which loads it again', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(PREVIEW);

    // Act
    const sheet = await openDialog();
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      "Couldn't load what will be deleted.",
    );
    expect(within(sheet).getByRole('button', { name: 'Delete user' })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Retry' }));

    // Assert
    expect(await within(sheet).findByText(/everything they posted/)).toBeInTheDocument();
    expect(api.fetchUserDeletionPreview).toHaveBeenCalledTimes(2);
  });

  it('keeps the dialog open with the message when the delete fails', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview.mockResolvedValue(PREVIEW);
    api.deleteAdminUser.mockRejectedValue(httpError(403, "Admins can't be deleted here."));
    const sheet = await openDialog();
    await within(sheet).findByText(/everything they posted/);

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete user' }));

    // Assert
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      "Admins can't be deleted here.",
    );
    expect(screen.getByRole('dialog', { name: 'Are you sure?' })).toBeInTheDocument();
    expect(screen.getByText('1 user')).toBeInTheDocument();
  });

  it('removes the row with "already deleted" on a 404', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview.mockResolvedValue(PREVIEW);
    api.deleteAdminUser.mockRejectedValue(httpError(404, 'User not found.'));
    const sheet = await openDialog();
    await within(sheet).findByText(/everything they posted/);

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete user' }));

    // Assert
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.toastSuccess).toHaveBeenCalledWith('That user was already deleted.');
    expect(screen.queryByText('Mia')).not.toBeInTheDocument();
  });

  it('treats a 404 on the preview as already deleted', async () => {
    // Arrange
    api.listAdminUsers.mockResolvedValue([adminUser()]);
    api.fetchUserDeletionPreview.mockRejectedValue(httpError(404, 'User not found.'));
    renderAt('/admin/users');
    const row = (await screen.findByText('Mia')).closest('li')!;

    // Act
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));

    // Assert
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.toastSuccess).toHaveBeenCalledWith('That user was already deleted.');
    expect(screen.queryByText('Mia')).not.toBeInTheDocument();
  });
});

describe('Communities tab — Delete', () => {
  beforeEach(() => signedIn(true));

  async function openDialog() {
    renderAt('/admin/communities');
    const row = (await screen.findByText('Friday Jazz')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    return screen.getByRole('dialog', { name: 'Are you sure?' });
  }

  it('opens the dialog with the member count, deletes, and shows the empty state', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([adminCommunity({ memberCount: 14 })]);
    api.deleteAdminCommunity.mockResolvedValue(undefined);

    // Act
    const sheet = await openDialog();
    expect(within(sheet).getByText(/All 14 members/)).toHaveTextContent(
      "Delete Friday Jazz? All 14 members lose its posts, ratings and comments, and each will be told an admin removed it. This can't be undone.",
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete community' }));

    // Assert
    expect(api.deleteAdminCommunity).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
    expect(api.toastSuccess).toHaveBeenCalledWith(`${isolate('Friday Jazz')} was deleted.`);
    expect(await screen.findByText('No communities yet.')).toBeInTheDocument();
  });

  it('words a one-member community in the singular', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([adminCommunity({ memberCount: 1 })]);

    // Act
    const sheet = await openDialog();

    // Assert
    expect(within(sheet).getByText(/Its 1 member/)).toHaveTextContent(
      'Its 1 member loses its posts, ratings and comments, and will be told an admin removed it.',
    );
  });

  it('keeps the dialog open with the message when the delete fails', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([adminCommunity()]);
    api.deleteAdminCommunity.mockRejectedValue(networkError());

    // Act
    const sheet = await openDialog();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete community' }));

    // Assert
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      "Couldn't delete the community. Try again.",
    );
    expect(screen.getByText('1 community')).toBeInTheDocument();
  });

  it('removes the row with "already deleted" on a 404', async () => {
    // Arrange
    api.listAdminCommunities.mockResolvedValue([
      adminCommunity(),
      adminCommunity({ id: 'c-other', name: 'Rock' }),
    ]);
    api.deleteAdminCommunity.mockRejectedValue(httpError(404, 'Community not found.'));

    // Act
    const sheet = await openDialog();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete community' }));

    // Assert
    await waitFor(() => expect(screen.queryByText('Friday Jazz')).not.toBeInTheDocument());
    expect(api.toastSuccess).toHaveBeenCalledWith('That community was already deleted.');
    expect(screen.getByText('Rock')).toBeInTheDocument();
  });
});
