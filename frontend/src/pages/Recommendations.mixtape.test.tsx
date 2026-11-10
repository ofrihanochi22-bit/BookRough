import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { LOAD_FAILED, OFFLINE } from '../lib/recommendationCopy';
import { useAuthStore } from '../stores/auth';
import { useFriendRequests } from '../stores/friendRequests';
import { makePost, makeSession, networkError, resetAuthStore, setOnline } from '../test/fixtures';
import { Recommendations } from './Recommendations';

const api = vi.hoisted(() => ({
  listReceived: vi.fn(),
  listSent: vi.fn(),
  markRecommendationsSeen: vi.fn(),
  hideRecommendation: vi.fn(),
  sendRecommendation: vi.fn(),
  countUnseenRecommendations: vi.fn(),
  listFriends: vi.fn(),
}));
vi.mock('../api/recommendations', () => ({
  listReceived: api.listReceived,
  listSent: api.listSent,
  markRecommendationsSeen: api.markRecommendationsSeen,
  hideRecommendation: api.hideRecommendation,
  sendRecommendation: api.sendRecommendation,
  countUnseenRecommendations: api.countUnseenRecommendations,
}));
vi.mock('../api/posts', () => ({
  getPost: vi.fn(),
  deletePost: vi.fn(),
  retryConversion: vi.fn(),
  CONVERSION_REQUEST_TIMEOUT_MS: 30_000,
}));
vi.mock('../api/ratings', () => ({ ratePost: vi.fn(), editRating: vi.fn() }));
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('../api/friends', () => ({ listFriends: api.listFriends, countFriendRequests: vi.fn() }));
vi.mock('../api/invitations', () => ({ countMyInvitations: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const NOAM = { id: 'noam-id', displayName: 'Noam', profilePictureUrl: null };
const DANA = { id: 'dana-id', displayName: 'Dana', profilePictureUrl: null };

const page = (posts: PublicPost[]) => ({ posts, nextCursor: null });

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/friends" element={<p>Friends screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const track = () => screen.getByRole('group', { name: 'Which list' });

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
  api.markRecommendationsSeen.mockResolvedValue(undefined);
  api.listFriends.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  resetAuthStore();
});

describe('Recommendations (ui-redesign.md §5.5)', () => {
  it('has the back link beside the logo, and Send a song on its own row under the heading', () => {
    // Act
    renderScreen();

    // Assert
    expect(screen.getByRole('link', { name: 'Friends' })).toHaveAttribute('href', '/friends');
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1, name: 'Recommendations' });
    const send = screen.getByRole('button', { name: 'Send a song' });
    expect(heading.nextElementSibling).toBe(send);
    expect(send.className).toContain('w-full');
  });

  it('keeps Received / Sent as aria-pressed buttons in a group, Received first', async () => {
    // Arrange
    api.listSent.mockResolvedValue(
      page([
        makePost({
          id: 'out-1',
          title: 'Sent Song',
          isMine: true,
          direct: { recipient: DANA, isFriend: true },
        }),
      ]),
    );
    renderScreen();
    const [received, sent] = within(track()).getAllByRole('button');

    // Act
    await userEvent.click(sent!);

    // Assert
    expect(received).toHaveTextContent('Received');
    expect(received).toHaveAttribute('aria-pressed', 'false');
    expect(sent).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Sent Song')).toBeInTheDocument();
  });

  it('lists received songs as Mixtape post cards', async () => {
    // Arrange
    api.listReceived.mockResolvedValue(
      page([
        makePost({
          id: 'in-1',
          title: 'Song 1',
          author: DANA,
          direct: { recipient: NOAM, isFriend: true },
        }),
      ]),
    );

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rate & Review Song 1' })).toBeEnabled();
  });

  it('opens the send sheet from Send a song', async () => {
    // Arrange
    renderScreen();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Send a song' }));

    // Assert
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows each list empty in the kit treatment', async () => {
    // Arrange
    renderScreen();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nothing here yet' }),
    ).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sent' }));

    // Assert
    expect(
      await screen.findByRole('heading', { level: 2, name: "You haven't sent anything" }),
    ).toBeInTheDocument();
  });

  it('shows skeletons, then the load error with Try again', async () => {
    // Arrange
    api.listReceived.mockRejectedValueOnce(networkError());

    // Act
    renderScreen();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading recommendations' })).toBeInTheDocument();
    expect(await screen.findByText(LOAD_FAILED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('disables Send a song with the dashed offline look', () => {
    // Arrange
    setOnline(false);

    // Act
    renderScreen();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(OFFLINE);
    const send = screen.getByRole('button', { name: 'Send a song' });
    expect(send).toBeDisabled();
    expect(send.className).toContain('border-dashed');
  });
});
