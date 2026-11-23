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
import { wipeCache } from '../lib/requestCache';
import { Recommendations } from './Recommendations';

/** The archive on Received — docs/features/archive-recommendations.md §7 (component). */

const api = vi.hoisted(() => ({
  listReceived: vi.fn(),
  listSent: vi.fn(),
  markRecommendationsSeen: vi.fn(),
  archiveRecommendation: vi.fn(),
  unarchiveRecommendation: vi.fn(),
  listArchived: vi.fn(),
  countArchived: vi.fn(),
  sendRecommendation: vi.fn(),
  countUnseenRecommendations: vi.fn(),
  countUnchecked: vi.fn(),
  listUnchecked: vi.fn(),
  markChecked: vi.fn(),
  unmarkChecked: vi.fn(),
  checkInBackground: vi.fn(),
}));
vi.mock('../api/recommendations', () => api);
const { toast } = vi.hoisted(() => ({
  // Callable like react-hot-toast's default export, with its helpers.
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('react-hot-toast', () => ({ default: toast }));
vi.mock('../api/posts', () => ({
  getPost: vi.fn(),
  deletePost: vi.fn(),
  retryConversion: vi.fn(),
  CONVERSION_REQUEST_TIMEOUT_MS: 30_000,
}));
vi.mock('../api/ratings', () => ({ ratePost: vi.fn(), editRating: vi.fn() }));
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('../api/friends', () => ({ listFriends: vi.fn(), countFriendRequests: vi.fn() }));
vi.mock('../api/invitations', () => ({ countMyInvitations: vi.fn() }));

const NOAM = { id: 'noam-id', displayName: 'Noam', profilePictureUrl: null };
const DANA = { id: 'dana-id', displayName: 'Dana', profilePictureUrl: null };

function inbound(n: number, overrides: Partial<PublicPost> = {}): PublicPost {
  return makePost({
    id: `in-${n}`,
    title: `Song ${n}`,
    author: DANA,
    direct: { recipient: NOAM, isFriend: true },
    ...overrides,
  });
}

const page = (posts: PublicPost[], nextCursor: string | null = null) => ({ posts, nextCursor });

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<Recommendations />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The content of the last plain toast, rendered so its Undo can be pressed. */
function lastToast() {
  const render = toast.mock.calls.at(-1)?.[0] as (shown: { id: string }) => ReactNode;
  return render({ id: 'toast-1' });
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  const card = (await screen.findByText(title)).closest('article')!;
  await user.click(within(card).getByRole('button', { name: 'Post options' }));
  return card;
}

async function openArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Archived · / }));
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
  api.listReceived.mockResolvedValue(page([]));
  api.listSent.mockResolvedValue(page([]));
  api.listArchived.mockResolvedValue(page([]));
  api.countArchived.mockResolvedValue(0);
  api.countUnchecked.mockResolvedValue(0);
  api.listUnchecked.mockResolvedValue({ items: [], nextCursor: null });
  api.markRecommendationsSeen.mockResolvedValue(undefined);
  api.archiveRecommendation.mockResolvedValue(undefined);
  api.unarchiveRecommendation.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  wipeCache();
  resetAuthStore();
});

describe('Recommendations — the archive row', () => {
  it('shows "Archived · N" on Received when the count is above 0', async () => {
    // Arrange
    api.countArchived.mockResolvedValue(12);

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByRole('button', { name: 'Archived · 12' })).toBeInTheDocument();
  });

  it('shows no row at 0, nor when the count fails', async () => {
    // Arrange
    api.countArchived.mockRejectedValueOnce(networkError());

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    await waitFor(() => expect(api.countArchived).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /^Archived/ })).not.toBeInTheDocument();
  });

  it('is not shown on Sent', async () => {
    // Arrange
    api.countArchived.mockResolvedValue(3);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('button', { name: 'Archived · 3' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Sent' }));

    // Assert
    expect(screen.queryByRole('button', { name: 'Archived · 3' })).not.toBeInTheDocument();
  });
});

describe('Recommendations — Archive', () => {
  it('removes the card at once, and Undo brings it back', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    renderScreen();

    // Act
    const card = await openMenu(user, 'Song 1');
    await user.click(within(card).getByRole('button', { name: 'Archive' }));

    // Assert
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument();
    expect(api.archiveRecommendation).toHaveBeenCalledWith('in-1');
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(api.countArchived).toHaveBeenCalledTimes(2);

    // Act: Undo, from the toast
    render(<>{lastToast()}</>);
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    // Assert
    expect(api.unarchiveRecommendation).toHaveBeenCalledWith('in-1');
    expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(api.countArchived).toHaveBeenCalledTimes(3);
  });

  it('a failed Archive brings the card back with an error toast, and no Undo', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    api.archiveRecommendation.mockRejectedValue(networkError());
    renderScreen();

    // Act
    const card = await openMenu(user, 'Song 1');
    await user.click(within(card).getByRole('button', { name: 'Archive' }));

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't archive this. Check your connection and try again.",
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it('an item already gone leaves quietly', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    api.archiveRecommendation.mockRejectedValue(httpError(404, 'Post not found.'));
    renderScreen();

    // Act
    const card = await openMenu(user, 'Song 1');
    await user.click(within(card).getByRole('button', { name: 'Archive' }));

    // Assert
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('offline, Archive is disabled', async () => {
    // Arrange
    setOnline(false);
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    renderScreen();

    // Act
    const card = await openMenu(user, 'Song 1');

    // Assert
    expect(within(card).getByRole('button', { name: 'Archive' })).toBeDisabled();
  });
});

describe('Recommendations — the archive view', () => {
  it('the row opens the archive, and "← Received" goes back', async () => {
    // Arrange
    const user = userEvent.setup();
    api.countArchived.mockResolvedValue(1);
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    api.listArchived.mockResolvedValue(page([inbound(2)]));
    renderScreen();

    // Act
    await openArchive(user);

    // Assert
    expect(screen.getByRole('heading', { name: 'Archived' })).toBeInTheDocument();
    expect(await screen.findByText('Song 2')).toBeInTheDocument();
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archived · 1' })).not.toBeInTheDocument();

    // Act
    await user.click(screen.getByRole('button', { name: '← Received' }));

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Archived' })).not.toBeInTheDocument();
  });

  it('switching pills closes the archive', async () => {
    // Arrange
    const user = userEvent.setup();
    api.countArchived.mockResolvedValue(1);
    api.listArchived.mockResolvedValue(page([inbound(2)]));
    renderScreen();
    await openArchive(user);
    await screen.findByText('Song 2');

    // Act
    await user.click(screen.getByRole('button', { name: 'Received' }));

    // Assert
    expect(screen.queryByRole('heading', { name: 'Archived' })).not.toBeInTheDocument();
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('Unarchive removes the card with "Back in Received", and no Archive row in the menu', async () => {
    // Arrange
    const user = userEvent.setup();
    api.countArchived.mockResolvedValue(1);
    api.listArchived.mockResolvedValue(page([inbound(2)]));
    renderScreen();
    await openArchive(user);

    // Act
    const card = await openMenu(user, 'Song 2');

    // Assert
    expect(within(card).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Rate & Review/ })).toBeInTheDocument();

    // Act
    await user.click(within(card).getByRole('button', { name: 'Unarchive' }));

    // Assert
    expect(api.unarchiveRecommendation).toHaveBeenCalledWith('in-2');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Back in Received'));
    expect(screen.getByText('Nothing archived')).toBeInTheDocument();
    expect(
      screen.getByText('Recommendations you archive from Received appear here.'),
    ).toBeInTheDocument();
  });

  it('a failed Unarchive brings the card back with an error toast', async () => {
    // Arrange
    const user = userEvent.setup();
    api.countArchived.mockResolvedValue(1);
    api.listArchived.mockResolvedValue(page([inbound(2)]));
    api.unarchiveRecommendation.mockRejectedValue(networkError());
    renderScreen();
    await openArchive(user);

    // Act
    const card = await openMenu(user, 'Song 2');
    await user.click(within(card).getByRole('button', { name: 'Unarchive' }));

    // Assert
    expect(await screen.findByText('Song 2')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't unarchive this. Check your connection and try again.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a load error offers Try again, which reloads', async () => {
    // Arrange
    const user = userEvent.setup();
    api.countArchived.mockResolvedValue(1);
    api.listArchived
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(page([inbound(2)]));
    renderScreen();
    await openArchive(user);

    // Act
    expect(await screen.findByText("Couldn't load your archive.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('Song 2')).toBeInTheDocument();
  });

  it('offline, Unarchive is disabled', async () => {
    // Arrange
    setOnline(false);
    const user = userEvent.setup();
    api.countArchived.mockResolvedValue(1);
    api.listArchived.mockResolvedValue(page([inbound(2)]));
    renderScreen();
    await openArchive(user);

    // Act
    const card = await openMenu(user, 'Song 2');

    // Assert
    expect(within(card).getByRole('button', { name: 'Unarchive' })).toBeDisabled();
  });
});
