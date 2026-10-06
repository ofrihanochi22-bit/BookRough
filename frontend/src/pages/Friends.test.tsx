import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FriendView } from '../api/friends';
import { ACTION_FAILED, FRIENDS_LOAD_FAILED, FRIENDS_OFFLINE } from '../lib/friendCopy';
import { useAuthStore } from '../stores/auth';
import { useFriendRequests } from '../stores/friendRequests';
import { httpError, makeSession, networkError, resetAuthStore, setOnline } from '../test/fixtures';
import { Friends } from './Friends';

const api = vi.hoisted(() => ({
  listFriends: vi.fn(),
  listFriendRequests: vi.fn(),
  acceptFriendRequest: vi.fn(),
  ignoreFriendRequest: vi.fn(),
  countFriendRequests: vi.fn(),
  removeFriend: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/friends', () => ({
  listFriends: api.listFriends,
  listFriendRequests: api.listFriendRequests,
  acceptFriendRequest: api.acceptFriendRequest,
  ignoreFriendRequest: api.ignoreFriendRequest,
  countFriendRequests: api.countFriendRequests,
  removeFriend: api.removeFriend,
}));
const invitationsApi = vi.hoisted(() => ({
  listMyInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));
vi.mock('../api/invitations', () => invitationsApi);
vi.mock('react-hot-toast', () => ({
  default: { success: api.toastSuccess, error: api.toastError },
}));

const SENDER_GONE = 'This request is no longer valid as the user account does not exist.';

function view(id: string, name: string): FriendView {
  return {
    user: { id, displayName: name, profilePictureUrl: null },
    since: '2026-10-06T10:00:00.000Z',
  };
}

const DANA = view('dana', 'Dana Levi');
const NOA = view('noa', 'Noa');
const YAEL = view('yael', 'Yael Ben');

function renderFriends() {
  return render(
    <MemoryRouter>
      <Friends />
    </MemoryRouter>,
  );
}

const requests = () => screen.getByRole('region', { name: 'Requests' });
const friends = () => screen.getByRole('region', { name: 'Your friends' });
const names = (region: HTMLElement) =>
  within(region)
    .queryAllByRole('link')
    .map((link) => link.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
  useFriendRequests.setState({ count: 2 });
  api.listFriendRequests.mockResolvedValue([DANA, NOA]);
  api.listFriends.mockResolvedValue([YAEL]);
  api.countFriendRequests.mockResolvedValue(0);
  invitationsApi.listMyInvitations.mockResolvedValue([]);
});

afterEach(() => {
  // Unmount first: resetting the store under a mounted screen re-renders it outside act.
  cleanup();
  resetAuthStore();
});

describe('Friends', () => {
  it('shows skeletons while loading', () => {
    // Arrange
    api.listFriendRequests.mockReturnValue(new Promise(() => {}));

    // Act
    renderFriends();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading your friends' })).toBeInTheDocument();
  });

  it('lists requests and friends, each name linking to their profile', async () => {
    // Act
    renderFriends();

    // Assert
    expect(await screen.findByRole('link', { name: 'Dana Levi' })).toHaveAttribute(
      'href',
      '/users/dana',
    );
    expect(names(requests())).toEqual(['DLDana Levi', 'NNoa']);
    expect(names(friends())).toEqual(['YBYael Ben']);
    expect(within(requests()).getByRole('button', { name: 'Accept Dana Levi' })).toBeEnabled();
  });

  it('Accept moves the person to Your friends, toasts, and lowers the badge', async () => {
    // Arrange
    api.acceptFriendRequest.mockResolvedValue(DANA);
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Accept Dana Levi' }));

    // Assert
    expect(api.acceptFriendRequest).toHaveBeenCalledWith('dana');
    expect(names(requests())).toEqual(['NNoa']);
    expect(names(friends())).toEqual(['DLDana Levi', 'YBYael Ben']);
    expect(api.toastSuccess).toHaveBeenCalledWith("You're now friends with Dana Levi.");
    expect(useFriendRequests.getState().count).toBe(1);
  });

  it('Ignore removes the row without a toast and lowers the badge', async () => {
    // Arrange
    api.ignoreFriendRequest.mockResolvedValue(undefined);
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Ignore Noa' }));

    // Assert
    expect(names(requests())).toEqual(['DLDana Levi']);
    expect(names(friends())).toEqual(['YBYael Ben']);
    expect(api.toastSuccess).not.toHaveBeenCalled();
    expect(useFriendRequests.getState().count).toBe(1);
  });

  it("an Accept answered 404 removes the row and toasts the server's message", async () => {
    // Arrange
    api.acceptFriendRequest.mockRejectedValue(httpError(404, SENDER_GONE));
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Accept Dana Levi' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith(SENDER_GONE);
    expect(names(requests())).toEqual(['NNoa']);
    expect(names(friends())).toEqual(['YBYael Ben']);
    expect(api.countFriendRequests).toHaveBeenCalled();
  });

  it('a network failure keeps the row and toasts', async () => {
    // Arrange
    api.ignoreFriendRequest.mockRejectedValue(networkError());
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Ignore Noa' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith(ACTION_FAILED);
    expect(names(requests())).toEqual(['DLDana Levi', 'NNoa']);
  });

  it('shows the empty state, linking to Search, with no requests and no friends', async () => {
    // Arrange
    api.listFriendRequests.mockResolvedValue([]);
    api.listFriends.mockResolvedValue([]);

    // Act
    renderFriends();

    // Assert
    expect(await screen.findByText('No friends yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
    expect(screen.queryByRole('region', { name: 'Requests' })).not.toBeInTheDocument();
  });

  it('with requests but no friends, Your friends says where they will appear', async () => {
    // Arrange
    api.listFriends.mockResolvedValue([]);

    // Act
    renderFriends();

    // Assert
    expect(await screen.findByText('Friends you accept appear here.')).toBeInTheDocument();
  });

  it('shows the load error, and Try again reloads', async () => {
    // Arrange
    api.listFriends.mockRejectedValueOnce(networkError()).mockResolvedValue([YAEL]);
    renderFriends();
    await screen.findByText(FRIENDS_LOAD_FAILED);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('link', { name: 'Yael Ben' })).toBeInTheDocument();
  });

  it('⋯ → Remove friend removes them from Your friends and toasts (unfriend.md §5.2)', async () => {
    // Arrange
    api.removeFriend.mockResolvedValue('NONE');
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Yael Ben' }));
    const sheet = screen.getByRole('dialog', { name: 'Remove friend?' });
    expect(sheet).toHaveTextContent("Remove Yael Ben from your friends? They won't be notified.");
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove friend' }));

    // Assert
    expect(api.removeFriend).toHaveBeenCalledWith('yael');
    expect(api.toastSuccess).toHaveBeenCalledWith('Removed Yael Ben from your friends.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(names(friends())).toEqual([]);
  });

  it("a failed removal keeps the friend and toasts UC-8's message", async () => {
    // Arrange
    api.removeFriend.mockRejectedValue(networkError());
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Yael Ben' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove friend' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith(ACTION_FAILED);
    expect(names(friends())).toEqual(['YBYael Ben']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("a removal answered 404 drops the row and toasts the server's message", async () => {
    // Arrange
    api.removeFriend.mockRejectedValue(httpError(404, 'User not found.'));
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Yael Ben' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove friend' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith('User not found.');
    expect(names(friends())).toEqual([]);
  });

  it('Cancel closes the sheet without a request', async () => {
    // Arrange
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Yael Ben' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.removeFriend).not.toHaveBeenCalled();
  });

  it('offline: the banner, and Accept and Ignore disabled; the lists stay', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderFriends();

    // Assert
    expect(await screen.findByRole('button', { name: 'Accept Dana Levi' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ignore Noa' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Actions for Yael Ben' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(FRIENDS_OFFLINE);
    expect(names(friends())).toEqual(['YBYael Ben']);
  });
});

describe('Friends — invitations (invite-friends.md §5.4)', () => {
  const invitation = {
    community: { id: 'club', name: 'Dana Club', memberCount: 3 },
    invitedBy: { id: 'dana', displayName: 'Dana Levi', profilePictureUrl: null },
    sentAt: '2026-10-06T10:00:00.000Z',
  };

  function renderWithCommunity() {
    return render(
      <MemoryRouter initialEntries={['/friends']}>
        <Routes>
          <Route path="/friends" element={<Friends />} />
          <Route path="/communities/:id" element={<p>Community page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('lists invitations above requests, with the inviter and member count', async () => {
    // Arrange
    invitationsApi.listMyInvitations.mockResolvedValue([
      invitation,
      { ...invitation, community: { id: 'c2', name: 'Orphan', memberCount: 1 }, invitedBy: null },
    ]);

    // Act
    renderWithCommunity();

    // Assert
    const section = await screen.findByRole('region', { name: 'Invitations' });
    expect(within(section).getByText('Dana Levi invited you · 3 members')).toBeInTheDocument();
    expect(within(section).getByText("You're invited · 1 member")).toBeInTheDocument();
    const order = [...document.querySelectorAll('section h2')].map((h) => h.textContent);
    expect(order.slice(0, 2)).toEqual(['Invitations', 'Requests']);
  });

  it('Join opens the community and toasts', async () => {
    // Arrange
    invitationsApi.listMyInvitations.mockResolvedValue([invitation]);
    invitationsApi.acceptInvitation.mockResolvedValue(undefined);
    renderWithCommunity();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Join Dana Club' }));

    // Assert
    expect(invitationsApi.acceptInvitation).toHaveBeenCalledWith('club');
    expect(await screen.findByText('Community page')).toBeInTheDocument();
    expect(api.toastSuccess).toHaveBeenCalledWith('You joined Dana Club.');
    expect(api.countFriendRequests).toHaveBeenCalled();
  });

  it('Decline removes the row without a toast and lowers the badge', async () => {
    // Arrange
    invitationsApi.listMyInvitations.mockResolvedValue([invitation]);
    invitationsApi.declineInvitation.mockResolvedValue(undefined);
    renderWithCommunity();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Decline Dana Club' }));

    // Assert: one invitation plus two requests made 3; declining leaves 2.
    expect(screen.queryByRole('region', { name: 'Invitations' })).not.toBeInTheDocument();
    expect(api.toastSuccess).not.toHaveBeenCalled();
    expect(useFriendRequests.getState().count).toBe(2);
  });

  it('a Join answered 404 removes the row and says it is gone', async () => {
    // Arrange
    invitationsApi.listMyInvitations.mockResolvedValue([invitation]);
    invitationsApi.acceptInvitation.mockRejectedValue(
      httpError(404, 'This invitation is no longer available.'),
    );
    renderWithCommunity();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Join Dana Club' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith('This invitation is no longer available.');
    expect(screen.queryByRole('region', { name: 'Invitations' })).not.toBeInTheDocument();
  });

  it('a network failure keeps the row; offline disables Join and Decline', async () => {
    // Arrange
    invitationsApi.listMyInvitations.mockResolvedValue([invitation]);
    invitationsApi.declineInvitation.mockRejectedValue(networkError());
    const { unmount } = renderWithCommunity();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Decline Dana Club' }));

    // Assert
    expect(api.toastError).toHaveBeenCalledWith(ACTION_FAILED);
    expect(screen.getByRole('region', { name: 'Invitations' })).toBeInTheDocument();
    unmount();

    // Act — offline
    setOnline(false);
    renderWithCommunity();

    // Assert
    expect(await screen.findByRole('button', { name: 'Join Dana Club' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline Dana Club' })).toBeDisabled();
  });
});
