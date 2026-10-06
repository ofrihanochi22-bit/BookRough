import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/friends', () => ({
  listFriends: api.listFriends,
  listFriendRequests: api.listFriendRequests,
  acceptFriendRequest: api.acceptFriendRequest,
  ignoreFriendRequest: api.ignoreFriendRequest,
  countFriendRequests: api.countFriendRequests,
}));
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

  it('offline: the banner, and Accept and Ignore disabled; the lists stay', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderFriends();

    // Assert
    expect(await screen.findByRole('button', { name: 'Accept Dana Levi' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ignore Noa' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(FRIENDS_OFFLINE);
    expect(names(friends())).toEqual(['YBYael Ben']);
  });
});
