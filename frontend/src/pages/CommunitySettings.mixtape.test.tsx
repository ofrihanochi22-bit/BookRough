import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommunityRole } from '../api/communities';
import { useAuthStore } from '../stores/auth';
import { makeCommunity, makeSession, makeUser, setOnline } from '../test/fixtures';
import { CommunitySettings } from './CommunitySettings';

const api = vi.hoisted(() => ({
  getCommunity: vi.fn(),
  listMembers: vi.fn(),
  listBlocked: vi.fn(),
  removeMember: vi.fn(),
  changeRole: vi.fn(),
}));

vi.mock('../api/communities', () => ({ getCommunity: api.getCommunity }));
vi.mock('../api/membership', () => ({
  listMembers: api.listMembers,
  listBlocked: api.listBlocked,
  leaveCommunity: vi.fn(),
  removeMember: api.removeMember,
  changeRole: api.changeRole,
  transferOwnership: vi.fn(),
  unblockUser: vi.fn(),
  updateCommunity: vi.fn(),
  deleteCommunity: vi.fn(),
}));
vi.mock('../api/invitations', () => ({
  listCandidates: () => Promise.resolve([]),
  inviteFriends: vi.fn(),
  cancelInvitation: vi.fn(),
}));
vi.mock('../api/invites', () => ({
  getInvite: () => new Promise(() => {}),
  inviteUrl: (token: string) => `/invite/${token}`,
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn() } }));

const ME = makeUser().id;
const ID = makeCommunity().id;

function member(id: string, name: string, role: CommunityRole) {
  return { user: { id, displayName: name, profilePictureUrl: null }, role, joinedAt: 'x' };
}

/** Ofri (me) as the owner, with one admin and two members. */
function asOwner() {
  api.getCommunity.mockResolvedValue(
    makeCommunity({ id: ID, name: 'Friday Jazz', myRole: 'OWNER', memberCount: 4 }),
  );
  api.listMembers.mockResolvedValue([
    member(ME, 'Ofri', 'OWNER'),
    member('ada', 'Ada', 'ADMIN'),
    member('mia', 'Mia', 'MEMBER'),
    member('noa', 'Noa', 'MEMBER'),
  ]);
  api.listBlocked.mockResolvedValue([]);
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={[`/communities/${ID}/settings`]}>
      <Routes>
        <Route path="/communities/:id/settings" element={<CommunitySettings />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
  asOwner();
});

describe('Community Settings (ui-redesign.md §5.16)', () => {
  it('shows the back link beside the logo and the Settings heading', async () => {
    // Act
    renderSettings();

    // Assert
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      `/communities/${ID}`,
    );
    expect(screen.getByText('BookRough')).toBeInTheDocument();
  });

  it('groups members into Owner, Admins and Members cards', async () => {
    // Act
    renderSettings();

    // Assert
    const owner = await screen.findByRole('list', { name: 'Owner' });
    expect(within(owner).getByText('Ofri')).toBeInTheDocument();
    const admins = screen.getByRole('list', { name: 'Admins' });
    expect(within(admins).getAllByRole('listitem')).toHaveLength(1);
    const members = screen.getByRole('list', { name: 'Members' });
    expect(within(members).getAllByRole('listitem')).toHaveLength(2);
  });

  it('hides a role group with nobody in it', async () => {
    // Arrange
    api.listMembers.mockResolvedValue([
      member(ME, 'Ofri', 'OWNER'),
      member('mia', 'Mia', 'MEMBER'),
    ]);

    // Act
    renderSettings();

    // Assert
    expect(await screen.findByRole('list', { name: 'Members' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Admins' })).not.toBeInTheDocument();
  });

  it('opens a bottom action sheet from ⋯ with only that member’s actions, and Cancel', async () => {
    // Arrange
    renderSettings();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Mia' }));

    // Assert
    const sheet = screen.getByRole('dialog', { name: 'Mia' });
    expect(within(sheet).getByRole('button', { name: 'Make admin' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Make owner' })).toBeInTheDocument();
    const remove = within(sheet).getByRole('button', { name: 'Remove from community' });
    expect(remove.className).toContain('text-danger');
    expect(within(sheet).queryByRole('button', { name: 'Make member' })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs a role change straight from the sheet', async () => {
    // Arrange
    api.changeRole.mockResolvedValue(undefined);
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Mia' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Make admin' }));

    // Assert
    expect(api.changeRole).toHaveBeenCalledWith(ID, 'mia', 'ADMIN');
    expect(screen.queryByRole('dialog', { name: 'Mia' })).not.toBeInTheDocument();
  });

  it('leads Remove to the existing confirmation sheet', async () => {
    // Arrange
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Noa' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Remove from community' }));

    // Assert
    const confirm = screen.getByRole('dialog', { name: 'Remove from community' });
    expect(
      within(confirm).getByText('Are you sure you want to remove Noa from this community?'),
    ).toBeInTheDocument();
  });

  it('shows no ⋯ on the owner’s own row', async () => {
    // Act
    renderSettings();

    // Assert
    await screen.findByRole('list', { name: 'Owner' });
    expect(screen.queryByRole('button', { name: 'Actions for Ofri' })).not.toBeInTheDocument();
  });

  it('shows Leave as an outlined pill and Delete as the soft destructive pill', async () => {
    // Act
    renderSettings();

    // Assert
    const leave = await screen.findByRole('button', { name: 'Leave community' });
    expect(leave.className).toContain('border-line');
    const remove = screen.getByRole('button', { name: 'Delete community' });
    expect(remove.className).toContain('bg-danger-soft');
    expect(remove.className).toContain('text-danger');
  });

  it('gives offline-disabled buttons the dashed treatment', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderSettings();

    // Assert
    for (const name of ['Leave community', 'Delete community', 'Save changes']) {
      const button = await screen.findByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button.className).toContain('border-dashed');
    }
  });
});
