import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { useAuthStore } from '../stores/auth';
import { useFriendRequests } from '../stores/friendRequests';
import {
  httpError,
  makePost,
  makeSession,
  networkError,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { cacheKeys } from '../lib/cacheKeys';
import { cacheSequence, setCached, wipeCache } from '../lib/requestCache';
import { Recommendations } from './Recommendations';

/** The Communities list — docs/features/community-unchecked.md §7 (component). */

const api = vi.hoisted(() => ({
  listReceived: vi.fn(),
  listSent: vi.fn(),
  markRecommendationsSeen: vi.fn(),
  hideRecommendation: vi.fn(),
  sendRecommendation: vi.fn(),
  countUnseenRecommendations: vi.fn(),
  countUnchecked: vi.fn(),
  listUnchecked: vi.fn(),
  markChecked: vi.fn(),
  unmarkChecked: vi.fn(),
  checkInBackground: vi.fn(),
}));
vi.mock('../api/recommendations', () => api);
const { getPost, ratePost, saveBookmark, toast } = vi.hoisted(() => {
  // Callable like react-hot-toast's default export, with its helpers.
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() });
  return { getPost: vi.fn(), ratePost: vi.fn(), saveBookmark: vi.fn(), toast };
});
vi.mock('react-hot-toast', () => ({ default: toast }));
vi.mock('../api/posts', () => ({
  getPost,
  deletePost: vi.fn(),
  retryConversion: vi.fn(),
  CONVERSION_REQUEST_TIMEOUT_MS: 30_000,
}));
vi.mock('../api/ratings', () => ({ ratePost, editRating: vi.fn() }));
vi.mock('../api/bookmarks', () => ({ saveBookmark, removeBookmark: vi.fn() }));
vi.mock('../api/friends', () => ({ listFriends: vi.fn(), countFriendRequests: vi.fn() }));
vi.mock('../api/invitations', () => ({ countMyInvitations: vi.fn() }));

const NOAM = { id: 'noam-id', displayName: 'Noam', profilePictureUrl: null };
const JAZZ = { id: 'jazz-id', name: 'Friday Jazz' };

function communityPost(n: number, overrides: Partial<PublicPost> = {}): PublicPost {
  return makePost({ id: `c-${n}`, title: `Song ${n}`, author: NOAM, direct: null, ...overrides });
}

const pageOf = (posts: PublicPost[], nextCursor: string | null = null) => ({
  items: posts.map((post) => ({ post, community: JAZZ })),
  nextCursor,
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openCommunities(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Communities/ }));
}

/** The content of the last plain toast, rendered so its Undo can be pressed. */
function lastToast() {
  const render = toast.mock.calls.at(-1)?.[0] as (shown: { id: string }) => ReactNode;
  return render({ id: 'toast-1' });
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
  useFriendRequests.setState({
    count: 0,
    unseen: 0,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  api.listReceived.mockResolvedValue({ posts: [], nextCursor: null });
  api.markRecommendationsSeen.mockResolvedValue(undefined);
  api.countUnchecked.mockResolvedValue(0);
  api.listUnchecked.mockResolvedValue(pageOf([]));
  api.markChecked.mockResolvedValue(undefined);
  api.unmarkChecked.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  wipeCache();
  resetAuthStore();
});

describe('Recommendations — Communities', () => {
  it('shows the count on its pill, and plain at zero', async () => {
    // Arrange
    api.countUnchecked.mockResolvedValue(4);

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByRole('button', { name: 'Communities · 4' })).toBeInTheDocument();
    expect(api.listUnchecked).not.toHaveBeenCalled();
  });

  it('lists each card under its community, linking to it, with Mark checked and Rate & Review', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    renderScreen();

    // Act
    await openCommunities(user);

    // Assert
    const card = (await screen.findByText('Song 1')).closest('article')!;
    expect(within(card).getByRole('button', { name: 'Mark checked' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: /Rate & Review/ })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Friday Jazz' })).toHaveAttribute(
      'href',
      '/communities/jazz-id',
    );
  });

  it('Mark checked removes the card at once, and Undo brings it back', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    renderScreen();
    await openCommunities(user);

    // Act
    await user.click(await screen.findByRole('button', { name: 'Mark checked' }));

    // Assert
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument();
    expect(api.markChecked).toHaveBeenCalledWith('c-1');
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(api.countUnchecked).toHaveBeenCalledTimes(2);

    // Act: Undo, from the toast
    render(<>{lastToast()}</>);
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    // Assert
    expect(api.unmarkChecked).toHaveBeenCalledWith('c-1');
    expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
  });

  it('a failed Mark checked brings the card back with an error toast', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    api.markChecked.mockRejectedValue(networkError());
    renderScreen();
    await openCommunities(user);

    // Act
    await user.click(await screen.findByRole('button', { name: 'Mark checked' }));

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Couldn't mark it checked.");
    expect(toast).not.toHaveBeenCalled();
  });

  it('a post already gone leaves quietly, with no Undo', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    api.markChecked.mockRejectedValue(httpError(404, 'Post not found.'));
    renderScreen();
    await openCommunities(user);

    // Act
    await user.click(await screen.findByRole('button', { name: 'Mark checked' }));

    // Assert
    await waitFor(() => expect(api.countUnchecked).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a failed Undo says so and keeps the card out', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    api.unmarkChecked.mockRejectedValue(networkError());
    renderScreen();
    await openCommunities(user);
    await user.click(await screen.findByRole('button', { name: 'Mark checked' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());

    // Act
    render(<>{lastToast()}</>);
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    // Assert
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't undo. Check your connection and try again.",
      ),
    );
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument();
  });

  it('saving a card takes it off the list', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    saveBookmark.mockResolvedValue(undefined);
    renderScreen();
    await openCommunities(user);

    // Act
    await user.click(await screen.findByRole('button', { name: /Listen Later/ }));

    // Assert
    await waitFor(() => expect(screen.queryByText('Song 1')).not.toBeInTheDocument());
    expect(saveBookmark).toHaveBeenCalledWith('c-1');
  });

  it('rating a card takes it off the list', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    ratePost.mockResolvedValue({});
    getPost.mockResolvedValue({ post: communityPost(1, { myScore: 8 }), community: JAZZ });
    renderScreen();
    await openCommunities(user);

    // Act
    await user.click(await screen.findByRole('button', { name: /Rate & Review/ }));
    const sheet = screen.getByRole('dialog', { name: 'Rate & Review' });
    await user.click(within(sheet).getByRole('radio', { name: '8 out of 10' }));
    await user.click(within(sheet).getByRole('button', { name: 'Submit Rating' }));

    // Assert
    await waitFor(() => expect(screen.queryByText('Song 1')).not.toBeInTheDocument());
    expect(ratePost).toHaveBeenCalledWith('c-1', { score: 8, comment: null });
  });

  it('shows the caught-up empty state', async () => {
    // Arrange
    const user = userEvent.setup();
    renderScreen();

    // Act
    await openCommunities(user);

    // Assert
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });

  it('a load error offers Try again, which reloads', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(pageOf([communityPost(1)]));
    renderScreen();
    await openCommunities(user);

    // Act
    expect(
      await screen.findByText("Couldn't load posts from your communities."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
  });

  it('Load more adds the next page with its communities', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listUnchecked
      .mockResolvedValueOnce(pageOf([communityPost(1)], 'next'))
      .mockResolvedValueOnce({
        items: [{ post: communityPost(2), community: { id: 'rock-id', name: 'Rock' } }],
        nextCursor: null,
      });
    renderScreen();
    await openCommunities(user);

    // Act
    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByText('Song 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rock' })).toBeInTheDocument();
    expect(api.listUnchecked).toHaveBeenLastCalledWith('next');
  });

  it('offline, Mark checked is disabled', async () => {
    // Arrange
    setOnline(false);
    const user = userEvent.setup();
    api.listUnchecked.mockResolvedValue(pageOf([communityPost(1)]));
    renderScreen();

    // Act
    await openCommunities(user);

    // Assert
    expect(await screen.findByRole('button', { name: 'Mark checked' })).toBeDisabled();
  });

  it('reads a Received page persisted by an older version, which has no communities', async () => {
    // Arrange: the device copy has the old shape, and the refresh never answers.
    setCached(
      cacheKeys.recsReceived,
      {
        posts: [
          makePost({ id: 'in-1', title: 'Old', direct: { recipient: NOAM, isFriend: true } }),
        ],
        nextCursor: null,
      },
      true,
      cacheSequence(),
    );
    api.listReceived.mockReturnValue(new Promise(() => {}));

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByText('Old')).toBeInTheDocument();
  });
});
