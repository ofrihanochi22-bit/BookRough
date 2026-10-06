import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommunityRole } from '../api/communities';
import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makeCommunity,
  makeSession,
  makeUser,
  networkError,
  setOnline,
} from '../test/fixtures';
import { CommunitySettings } from './CommunitySettings';

const api = vi.hoisted(() => ({
  getCommunity: vi.fn(),
  listMembers: vi.fn(),
  listBlocked: vi.fn(),
  leaveCommunity: vi.fn(),
  removeMember: vi.fn(),
  changeRole: vi.fn(),
  transferOwnership: vi.fn(),
  unblockUser: vi.fn(),
  updateCommunity: vi.fn(),
  deleteCommunity: vi.fn(),
  getInvite: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../api/communities', () => ({ getCommunity: api.getCommunity }));
vi.mock('../api/membership', () => ({
  listMembers: api.listMembers,
  listBlocked: api.listBlocked,
  leaveCommunity: api.leaveCommunity,
  removeMember: api.removeMember,
  changeRole: api.changeRole,
  transferOwnership: api.transferOwnership,
  unblockUser: api.unblockUser,
  updateCommunity: api.updateCommunity,
  deleteCommunity: api.deleteCommunity,
}));
vi.mock('../api/invites', () => ({
  getInvite: api.getInvite,
  inviteUrl: (token: string) => `/invite/${token}`,
}));
vi.mock('react-hot-toast', () => ({ default: { success: api.toastSuccess } }));

const ME = makeUser().id;
const ID = makeCommunity().id;

function member(id: string, name: string, role: CommunityRole) {
  return {
    user: { id, displayName: name, profilePictureUrl: null },
    role,
    joinedAt: '2026-10-04T09:00:00.000Z',
  };
}

/** The community as seen by a caller with `myRole`; Ofri (me) plus three others. */
function seenAs(myRole: CommunityRole) {
  const others =
    myRole === 'OWNER'
      ? [member('ada', 'Ada', 'ADMIN'), member('mia', 'Mia', 'MEMBER')]
      : [
          member('own', 'Olga', 'OWNER'),
          member('ada', 'Ada', 'ADMIN'),
          member('mia', 'Mia', 'MEMBER'),
        ];
  const members = [
    ...others.filter((m) => m.role === 'OWNER'),
    member(ME, 'Ofri', myRole),
    ...others.filter((m) => m.role !== 'OWNER'),
  ];
  api.getCommunity.mockResolvedValue(
    makeCommunity({
      id: ID,
      name: 'Friday Jazz',
      description: 'Records.',
      myRole,
      memberCount: members.length,
    }),
  );
  api.listMembers.mockResolvedValue(members);
  if (myRole === 'MEMBER') {
    api.listBlocked.mockRejectedValue(httpError(403, 'Only admins can manage blocked people.'));
  } else {
    api.listBlocked.mockResolvedValue([]);
  }
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={[`/communities/${ID}/settings`]}>
      <Routes>
        <Route path="/communities/:id/settings" element={<CommunitySettings />} />
        <Route path="/communities/:id" element={<p>Community page</p>} />
        <Route path="/home" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const rowOf = (name: string) => screen.getByText(name).closest('li')!;

async function openActions(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
  api.getInvite.mockResolvedValue({ token: 'tok' });
});

describe('CommunitySettings — what each role sees', () => {
  it('a member sees the list and Leave, and nothing to manage', async () => {
    // Arrange
    seenAs('MEMBER');

    // Act
    renderSettings();

    // Assert
    expect(await screen.findByText('Members · 4 members')).toBeInTheDocument();
    expect(within(rowOf('Olga')).getByText('Owner')).toBeInTheDocument();
    expect(within(rowOf('Ofri')).getByText(/You/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave community' })).toBeInTheDocument();
    for (const absent of ['Save changes', 'Invite friends', 'Delete community']) {
      expect(screen.queryByRole('button', { name: absent })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('an admin sees details, invite and member actions — but no Delete and no Make owner', async () => {
    // Arrange
    seenAs('ADMIN');
    renderSettings();

    // Act
    await openActions('Mia');

    // Assert
    expect(screen.getByLabelText('Name')).toHaveValue('Friday Jazz');
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from community' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make owner' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Olga' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete community' })).not.toBeInTheDocument();
  });

  it('the owner sees everything, including Make owner and Delete', async () => {
    // Arrange
    seenAs('OWNER');
    renderSettings();

    // Act
    await openActions('Ada');

    // Assert
    expect(screen.getByRole('button', { name: 'Make member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make owner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete community' })).toBeInTheDocument();
  });

  it('opens the invite panel from the Invite section', async () => {
    // Arrange
    seenAs('ADMIN');
    renderSettings();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Invite friends' }));

    // Assert
    expect(await screen.findByDisplayValue('/invite/tok')).toBeInTheDocument();
  });
});

describe('CommunitySettings — member links (find-people.md §5.3)', () => {
  it("links each member's name to their profile, yours to My Profile, beside the ⋯ menu", async () => {
    // Arrange
    seenAs('OWNER');

    // Act
    renderSettings();

    // Assert
    const ada = await screen.findByRole('link', { name: 'Ada' });
    expect(ada).toHaveAttribute('href', '/users/ada');
    expect(screen.getByRole('link', { name: 'Ofri · You' })).toHaveAttribute('href', '/profile');
    await openActions('Ada');
    expect(screen.getByRole('button', { name: 'Make member' })).toBeInTheDocument();
    expect(screen.getByText('Members · 3 members')).toBeInTheDocument();
  });
});

describe('CommunitySettings — member actions', () => {
  it('Make admin changes the role at once, without a confirmation, and reloads the list', async () => {
    // Arrange
    seenAs('OWNER');
    api.changeRole.mockResolvedValue(member('mia', 'Mia', 'ADMIN'));
    renderSettings();
    await openActions('Mia');

    // Act
    api.listMembers.mockResolvedValue([
      member(ME, 'Ofri', 'OWNER'),
      member('ada', 'Ada', 'ADMIN'),
      member('mia', 'Mia', 'ADMIN'),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Make admin' }));

    // Assert
    expect(api.changeRole).toHaveBeenCalledWith(ID, 'mia', 'ADMIN');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('Mia')).getByText('Admin')).toBeInTheDocument());
  });

  it('Remove asks with the UC-14 wording, then the person moves to Blocked', async () => {
    // Arrange
    seenAs('OWNER');
    api.removeMember.mockResolvedValue(undefined);
    renderSettings();
    await openActions('Mia');
    await userEvent.click(screen.getByRole('button', { name: 'Remove from community' }));
    const sheet = screen.getByRole('dialog', { name: 'Remove from community' });
    expect(sheet).toHaveTextContent('Are you sure you want to remove Mia from this community?');
    expect(sheet).toHaveTextContent("They won't be able to rejoin until an admin unblocks them.");
    expect(sheet).toHaveTextContent(
      'Their posts and ratings in this community will be deleted too.',
    );

    // Act
    api.listMembers.mockResolvedValue([member(ME, 'Ofri', 'OWNER'), member('ada', 'Ada', 'ADMIN')]);
    api.listBlocked.mockResolvedValue([
      {
        user: { id: 'mia', displayName: 'Mia', profilePictureUrl: null },
        blockedAt: '2026-10-04T10:00:00.000Z',
      },
    ]);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove' }));

    // Assert
    expect(api.removeMember).toHaveBeenCalledWith(ID, 'mia');
    expect(await screen.findByRole('heading', { name: 'Blocked' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a 409 from Remove inside the sheet and keeps it open', async () => {
    // Arrange
    seenAs('OWNER');
    api.removeMember.mockRejectedValue(
      httpError(
        409,
        'Cannot remove an Admin. You must demote this user to a standard member before removing them.',
      ),
    );
    renderSettings();
    await openActions('Mia');
    await userEvent.click(screen.getByRole('button', { name: 'Remove from community' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    // Assert
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Cannot remove an Admin.',
    );
  });

  it('Unblock removes the person from the Blocked list without asking', async () => {
    // Arrange
    seenAs('ADMIN');
    api.listBlocked.mockResolvedValue([
      {
        user: { id: 'yoav', displayName: 'Yoav', profilePictureUrl: null },
        blockedAt: '2026-10-04T10:00:00.000Z',
      },
    ]);
    api.unblockUser.mockResolvedValue(undefined);
    renderSettings();

    // Act
    api.listBlocked.mockResolvedValue([]);
    await userEvent.click(await screen.findByRole('button', { name: 'Unblock' }));

    // Assert
    expect(api.unblockUser).toHaveBeenCalledWith(ID, 'yoav');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Blocked' })).not.toBeInTheDocument(),
    );
  });

  it('Make owner confirms, then shows the swapped roles', async () => {
    // Arrange
    seenAs('OWNER');
    api.transferOwnership.mockResolvedValue(makeCommunity({ myRole: 'ADMIN' }));
    renderSettings();
    await openActions('Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Make owner' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      "You'll become an admin, and only Ada will be able to delete the community.",
    );

    // Act
    api.getCommunity.mockResolvedValue(makeCommunity({ id: ID, myRole: 'ADMIN', memberCount: 3 }));
    api.listMembers.mockResolvedValue([
      member('ada', 'Ada', 'OWNER'),
      member(ME, 'Ofri', 'ADMIN'),
      member('mia', 'Mia', 'MEMBER'),
    ]);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Make owner' }),
    );

    // Assert
    expect(api.transferOwnership).toHaveBeenCalledWith(ID, 'ada');
    await waitFor(() => expect(within(rowOf('Ada')).getByText('Owner')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Delete community' })).not.toBeInTheDocument();
  });

  it('shows the not-found page when an action finds the caller no longer has access', async () => {
    // Arrange
    seenAs('ADMIN');
    api.changeRole.mockRejectedValue(httpError(404, 'Community not found.'));
    renderSettings();
    await openActions('Mia');

    // Act
    api.getCommunity.mockRejectedValue(httpError(404, 'Community not found.'));
    await userEvent.click(screen.getByRole('button', { name: 'Make admin' }));

    // Assert
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });
});

describe('CommunitySettings — leaving and deleting', () => {
  it('Leave confirms with the UC-10 wording, then goes to the dashboard', async () => {
    // Arrange
    seenAs('MEMBER');
    api.leaveCommunity.mockResolvedValue(undefined);
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave community' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Are you sure you want to leave this community?',
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

    // Assert
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(api.leaveCommunity).toHaveBeenCalledWith(ID);
  });

  it('the owner gets the transfer-or-delete message instead of leaving', async () => {
    // Arrange
    seenAs('OWNER');
    renderSettings();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Leave community' }));

    // Assert
    expect(screen.getByRole('dialog')).toHaveTextContent(
      "You're the owner. Transfer ownership to another member or delete the community before leaving.",
    );
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(api.leaveCommunity).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Delete stays disabled until the checkbox is ticked, then deletes and goes home', async () => {
    // Arrange
    seenAs('OWNER');
    api.deleteCommunity.mockResolvedValue(undefined);
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete community' }));
    const sheet = screen.getByRole('dialog', { name: 'Delete community' });
    const confirm = within(sheet).getByRole('button', { name: 'Delete community' });
    expect(sheet).toHaveTextContent(
      "Warning: this can't be undone. The community will be deleted for all 3 members.",
    );
    expect(confirm).toBeDisabled();

    // Act
    await userEvent.click(
      within(sheet).getByRole('checkbox', { name: "I understand this can't be undone" }),
    );
    await userEvent.click(confirm);

    // Assert
    expect(api.deleteCommunity).toHaveBeenCalledWith(ID);
    expect(api.toastSuccess).toHaveBeenCalledWith('Community deleted');
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('shows a failed delete inside the sheet', async () => {
    // Arrange
    seenAs('OWNER');
    api.deleteCommunity.mockRejectedValue(networkError());
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete community' }));
    const sheet = screen.getByRole('dialog');

    // Act
    await userEvent.click(within(sheet).getByRole('checkbox'));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete community' }));

    // Assert
    expect(await within(sheet).findByRole('alert')).toHaveTextContent("Can't reach the server.");
  });
});

describe('CommunitySettings — editing details', () => {
  it('Save is disabled until something changes, then saves and confirms', async () => {
    // Arrange
    seenAs('ADMIN');
    api.updateCommunity.mockResolvedValue(makeCommunity({ name: 'Friday Jazz Club' }));
    renderSettings();
    const save = await screen.findByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    // Act
    await userEvent.type(screen.getByLabelText('Name'), ' Club');
    await userEvent.click(save);

    // Assert
    expect(api.updateCommunity).toHaveBeenCalledWith(ID, {
      name: 'Friday Jazz Club',
      description: 'Records.',
    });
    expect(api.toastSuccess).toHaveBeenCalledWith('Changes saved');
  });

  it('pins a 422 under the field', async () => {
    // Arrange
    seenAs('ADMIN');
    api.updateCommunity.mockRejectedValue(httpError(422, "That character isn't allowed."));
    renderSettings();
    await userEvent.type(await screen.findByLabelText('Name'), ' Club');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    expect(await screen.findByText("That character isn't allowed.")).toHaveAttribute(
      'id',
      'community-name-error',
    );
  });
});

describe('CommunitySettings — loading and errors', () => {
  it('shows skeletons while loading', () => {
    // Arrange
    api.getCommunity.mockReturnValue(new Promise(() => {}));
    api.listMembers.mockReturnValue(new Promise(() => {}));
    api.listBlocked.mockReturnValue(new Promise(() => {}));

    // Act
    renderSettings();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading settings' })).toBeInTheDocument();
  });

  it('offers Try again after a failed load', async () => {
    // Arrange
    seenAs('MEMBER');
    api.listMembers.mockRejectedValueOnce(networkError());
    renderSettings();

    // Act
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the settings.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('Members · 4 members')).toBeInTheDocument();
  });

  it('renders the not-found page for a community the caller is not in', async () => {
    // Arrange
    api.getCommunity.mockRejectedValue(httpError(404, 'Community not found.'));
    api.listMembers.mockRejectedValue(httpError(404, 'Community not found.'));
    api.listBlocked.mockRejectedValue(httpError(404, 'Community not found.'));

    // Act
    renderSettings();

    // Assert
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });

  it('disables every action while offline but keeps the list readable', async () => {
    // Arrange
    seenAs('OWNER');
    setOnline(false);

    // Act
    renderSettings();

    // Assert
    expect(await screen.findByText("You're offline. Connect to make changes.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave community' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete community' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Actions for Ada' })).toBeDisabled();
    expect(screen.getByText('Mia')).toBeInTheDocument();
  });
});
