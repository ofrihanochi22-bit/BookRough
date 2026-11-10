import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FriendView } from '../api/friends';
import type { MyInvitation } from '../api/invitations';
import { FRIENDS_LOAD_FAILED, FRIENDS_OFFLINE } from '../lib/friendCopy';
import { useAuthStore } from '../stores/auth';
import { useFriendRequests } from '../stores/friendRequests';
import { makeSession, networkError, resetAuthStore, setOnline } from '../test/fixtures';
import { Friends } from './Friends';

const api = vi.hoisted(() => ({
  listFriends: vi.fn(),
  listFriendRequests: vi.fn(),
  acceptFriendRequest: vi.fn(),
  ignoreFriendRequest: vi.fn(),
  countFriendRequests: vi.fn(),
  removeFriend: vi.fn(),
  listMyInvitations: vi.fn(),
}));
vi.mock('../api/friends', () => ({
  listFriends: api.listFriends,
  listFriendRequests: api.listFriendRequests,
  acceptFriendRequest: api.acceptFriendRequest,
  ignoreFriendRequest: api.ignoreFriendRequest,
  countFriendRequests: api.countFriendRequests,
  removeFriend: api.removeFriend,
}));
vi.mock('../api/invitations', () => ({
  listMyInvitations: api.listMyInvitations,
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function view(id: string, name: string): FriendView {
  return {
    user: { id, displayName: name, profilePictureUrl: null },
    since: '2026-10-06T10:00:00.000Z',
  };
}

const DANA = view('dana', 'Dana Levi');
const YAEL = view('yael', 'Yael Ben');

function invitation(): MyInvitation {
  return {
    community: { id: 'jazz', name: 'Friday Jazz', memberCount: 3 },
    invitedBy: { id: 'dana', displayName: 'Dana Levi', profilePictureUrl: null },
    sentAt: '2026-10-06T10:00:00.000Z',
  };
}

function renderFriends() {
  return render(
    <MemoryRouter initialEntries={['/friends']}>
      <Routes>
        <Route path="/friends" element={<Friends />} />
        <Route path="/search" element={<p>Search screen</p>} />
        <Route path="/recommendations" element={<p>Recommendations screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
  useFriendRequests.setState({ count: 0, unseen: 0 });
  api.listFriendRequests.mockResolvedValue([]);
  api.listFriends.mockResolvedValue([YAEL]);
  api.countFriendRequests.mockResolvedValue(0);
  api.listMyInvitations.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  resetAuthStore();
});

describe('Friends (ui-redesign.md §5.4)', () => {
  it('shows the logo and a Search icon in the header that opens Search', async () => {
    // Arrange
    renderFriends();

    // Act
    await userEvent.click(screen.getByRole('link', { name: 'Search' }));

    // Assert
    expect(screen.getByText('Search screen')).toBeInTheDocument();
  });

  it('shows the Recommendations tile with its badge and the same target', async () => {
    // Arrange
    useFriendRequests.setState({ unseen: 3 });

    // Act
    renderFriends();

    // Assert
    const tile = screen.getByRole('link', { name: 'Recommendations, 3 new' });
    expect(tile).toHaveAttribute('href', '/recommendations');
    expect(tile).toHaveTextContent('3');
    expect(screen.getByRole('heading', { level: 1, name: 'Friends' })).toBeInTheDocument();
  });

  it('names the tile plainly and shows no badge when nothing is new', () => {
    // Act
    renderFriends();

    // Assert
    expect(screen.getByRole('link', { name: 'Recommendations' })).toHaveTextContent(
      /^Recommendations$/,
    );
  });

  it('lists invitations with a cassette, requests with Accept / Ignore, and friends with ⋯', async () => {
    // Arrange
    api.listMyInvitations.mockResolvedValue([invitation()]);
    api.listFriendRequests.mockResolvedValue([DANA]);

    // Act
    renderFriends();

    // Assert
    const invites = await screen.findByRole('region', { name: 'Invitations' });
    expect(within(invites).getByTestId('community-cover')).toBeInTheDocument();
    expect(within(invites).getByRole('button', { name: 'Join Friday Jazz' })).toBeEnabled();
    const requests = screen.getByRole('region', { name: 'Requests' });
    expect(within(requests).getByRole('button', { name: 'Accept Dana Levi' })).toBeEnabled();
    expect(within(requests).getByRole('button', { name: 'Ignore Dana Levi' })).toBeEnabled();
    const friends = screen.getByRole('region', { name: 'Your friends' });
    expect(within(friends).getByRole('button', { name: 'Actions for Yael Ben' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('opens the remove-friend sheet from ⋯', async () => {
    // Arrange
    renderFriends();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Yael Ben' }));

    // Assert
    expect(screen.getByRole('dialog')).toHaveTextContent('Yael Ben');
  });

  it('shows the kit empty state with the Search link when there is nobody', async () => {
    // Arrange
    api.listFriends.mockResolvedValue([]);

    // Act
    renderFriends();

    // Assert
    expect(
      await screen.findByRole('heading', { level: 2, name: 'No friends yet' }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Search' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/search', '/search']);
  });

  it('shows row skeletons while loading', () => {
    // Arrange
    api.listFriends.mockReturnValue(new Promise(() => {}));

    // Act
    renderFriends();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading your friends' })).toBeInTheDocument();
  });

  it('shows the load error with Try again', async () => {
    // Arrange
    api.listFriends.mockRejectedValueOnce(networkError());

    // Act
    renderFriends();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Assert
    expect(screen.queryByText(FRIENDS_LOAD_FAILED)).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Yael Ben' })).toBeInTheDocument();
  });

  it('shows the offline alert and the dashed offline buttons', async () => {
    // Arrange
    setOnline(false);
    api.listFriendRequests.mockResolvedValue([DANA]);

    // Act
    renderFriends();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(FRIENDS_OFFLINE);
    const accept = await screen.findByRole('button', { name: 'Accept Dana Levi' });
    expect(accept).toBeDisabled();
    expect(accept.className).toContain('border-dashed');
  });
});
