import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedPost } from '../api/bookmarks';
import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makePendingPost,
  makePost,
  makeSession,
  makeUser,
  networkError,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { MyList } from './MyList';

const { listBookmarks, removeBookmark, toastSuccess, toastError } = vi.hoisted(() => ({
  listBookmarks: vi.fn(),
  removeBookmark: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/bookmarks', () => ({ listBookmarks, removeBookmark }));
const { ratePost } = vi.hoisted(() => ({ ratePost: vi.fn() }));
vi.mock('../api/ratings', () => ({ ratePost }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: toastError } }));

const COMMUNITY = { id: '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40', name: 'Friday Jazz' };

function saved(n: number, overrides: Partial<SavedPost> = {}): SavedPost {
  return {
    savedAt: '2026-10-05T10:00:00.000Z',
    community: COMMUNITY,
    isMember: true,
    post: makePost({ id: `post-${n}`, title: `Song ${n}`, isBookmarked: true }),
    ...overrides,
  };
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/my-list']}>
      <Routes>
        <Route path="/my-list" element={<MyList />} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const titles = () => screen.queryAllByText(/^Song \d+$/).map((element) => element.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore
    .getState()
    .setSession(makeSession({ user: makeUser({ preferredService: 'DEEZER' }) }));
});

afterEach(() => {
  resetAuthStore();
});

describe('MyList', () => {
  it('shows skeletons while loading', () => {
    // Arrange
    listBookmarks.mockReturnValue(new Promise(() => {}));

    // Act
    renderList();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading your list' })).toBeInTheDocument();
  });

  it("lists saved songs with their author and community, opening in the viewer's service", async () => {
    // Arrange
    listBookmarks.mockResolvedValue({ items: [saved(1)], nextCursor: null });

    // Act
    renderList();

    // Assert
    const card = (await screen.findByText('Song 1')).closest('article')!;
    expect(within(card).getByText('Queen')).toBeInTheDocument();
    expect(within(card).getByText(/Shared by Dana in/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open in Deezer' })).toHaveAttribute(
      'href',
      'https://www.deezer.com/track/1',
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it("falls back to the original link when the viewer's service has no match", async () => {
    // Arrange
    listBookmarks.mockResolvedValue({
      items: [saved(1, { post: makePendingPost({ id: 'post-1', isBookmarked: true }) })],
      nextCursor: null,
    });

    // Act
    renderList();

    // Assert
    expect(await screen.findByText('Shared from Spotify')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toBeInTheDocument();
  });

  it('links the community while a member', async () => {
    // Arrange
    listBookmarks.mockResolvedValue({
      items: [saved(1)],
      nextCursor: null,
    });
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('link', { name: 'Friday Jazz' }));

    // Assert
    expect(screen.getByText('Community screen')).toBeInTheDocument();
  });

  it('shows a left community as plain text', async () => {
    // Arrange
    listBookmarks.mockResolvedValue({
      items: [saved(2, { community: { id: 'gone', name: 'Old Crew' }, isMember: false })],
      nextCursor: null,
    });

    // Act
    renderList();

    // Assert
    expect(await screen.findByText('Old Crew')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Old Crew' })).not.toBeInTheDocument();
    expect(screen.getByText("You're no longer in Old Crew")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rate & Review/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  it('loads more with the cursor and appends', async () => {
    // Arrange
    listBookmarks
      .mockResolvedValueOnce({ items: [saved(1)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [saved(2)], nextCursor: null });
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    await vi.waitFor(() => expect(titles()).toEqual(['Song 1', 'Song 2']));
    expect(listBookmarks).toHaveBeenLastCalledWith('c1');
  });

  it('offers Try again when Load more fails', async () => {
    // Arrange
    listBookmarks
      .mockResolvedValueOnce({ items: [saved(1)], nextCursor: 'c1' })
      .mockRejectedValueOnce(networkError());
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByText("Couldn't load more songs.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    // Arrange
    listBookmarks.mockResolvedValue({ items: [], nextCursor: null });

    // Act
    renderList();

    // Assert
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('removes a song at once, toasts, and shows the empty state when it was the last', async () => {
    // Arrange
    let finish!: () => void;
    removeBookmark.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    listBookmarks.mockResolvedValue({ items: [saved(1)], nextCursor: null });
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    // Assert: gone before the server answers.
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument();
    expect(removeBookmark).toHaveBeenCalledWith('post-1');

    // Act
    finish();

    // Assert
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Removed from Listen Later'));
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('brings the song back with the failure toast when removing fails', async () => {
    // Arrange
    removeBookmark.mockRejectedValue(networkError());
    listBookmarks.mockResolvedValue({ items: [saved(1), saved(2)], nextCursor: null });
    renderList();

    // Act
    await userEvent.click((await screen.findAllByRole('button', { name: 'Remove' }))[0]!);

    // Assert
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Failed to remove. Please check your connection and try again.',
      ),
    );
    expect(titles()).toEqual(['Song 1', 'Song 2']);
  });

  it('shows a load error with Try again', async () => {
    // Arrange
    listBookmarks
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ items: [saved(1)], nextCursor: null });
    renderList();

    // Assert
    expect(await screen.findByText("Couldn't load your list.")).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    await vi.waitFor(() =>
      expect(screen.queryByText("Couldn't load your list.")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
  });

  it('shows the offline banner and disables Remove, while the list stays readable', async () => {
    // Arrange
    setOnline(false);
    listBookmarks.mockResolvedValue({ items: [saved(1)], nextCursor: null });

    // Act
    renderList();

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(screen.getByText("You're offline. Connect to change your list.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rate & Review Song 1' })).toBeDisabled();
  });

  it("offers Rate & Review on a member's song; rating it takes the card off the list", async () => {
    // Arrange
    ratePost.mockResolvedValue({ id: 'r', score: 8, comment: null, createdAt: '' });
    listBookmarks.mockResolvedValue({ items: [saved(1), saved(2)], nextCursor: null });
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Rate & Review Song 1' }));
    const sheet = screen.getByRole('dialog', { name: 'Rate & Review' });
    await userEvent.click(within(sheet).getByRole('radio', { name: '8' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Submit Rating' }));

    // Assert
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Rating submitted'));
    expect(ratePost).toHaveBeenCalledWith('post-1', { score: 8, comment: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(titles()).toEqual(['Song 2']);
  });

  it("a deleted post leaves the list as a ghost row, with UC-13's message", async () => {
    // Arrange
    ratePost.mockRejectedValue(httpError(404, 'Post not found.'));
    listBookmarks.mockResolvedValue({ items: [saved(1)], nextCursor: null });
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Rate & Review Song 1' }));
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Rating' }));

    // Assert
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'This recommendation is no longer available as the original post was deleted.',
      ),
    );
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('closing the sheet keeps the song on the list', async () => {
    // Arrange
    listBookmarks.mockResolvedValue({ items: [saved(1)], nextCursor: null });
    renderList();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Rate & Review Song 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(titles()).toEqual(['Song 1']);
    expect(ratePost).not.toHaveBeenCalled();
  });
});
