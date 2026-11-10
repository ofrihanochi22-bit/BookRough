import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { useAuthStore } from '../stores/auth';
import { useFriendRequests } from '../stores/friendRequests';
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
import { Recommendations } from './Recommendations';

const api = vi.hoisted(() => ({
  listReceived: vi.fn(),
  listSent: vi.fn(),
  markRecommendationsSeen: vi.fn(),
  hideRecommendation: vi.fn(),
  sendRecommendation: vi.fn(),
  countUnseenRecommendations: vi.fn(),
}));
vi.mock('../api/recommendations', () => api);
const { getPost, deletePost, ratePost, listFriends, toastError } = vi.hoisted(() => ({
  getPost: vi.fn(),
  deletePost: vi.fn(),
  ratePost: vi.fn(),
  listFriends: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/posts', () => ({
  getPost,
  deletePost,
  retryConversion: vi.fn(),
  CONVERSION_REQUEST_TIMEOUT_MS: 30_000,
}));
vi.mock('../api/ratings', () => ({ ratePost, editRating: vi.fn() }));
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('../api/friends', () => ({ listFriends, countFriendRequests: vi.fn() }));
vi.mock('../api/invitations', () => ({ countMyInvitations: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: toastError } }));

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

function outbound(n: number, overrides: Partial<PublicPost> = {}): PublicPost {
  return makePost({
    id: `out-${n}`,
    title: `Sent ${n}`,
    author: NOAM,
    isMine: true,
    canDelete: true,
    direct: { recipient: DANA, isFriend: true },
    ...overrides,
  });
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/friends" element={<p>Friends screen</p>} />
        <Route path="/posts/:id" element={<p>Post screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const page = (posts: PublicPost[], nextCursor: string | null = null) => ({ posts, nextCursor });
const sentTab = () => screen.getByRole('button', { name: 'Sent' });

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore
    .getState()
    .setSession(makeSession({ user: makeUser({ preferredService: 'APPLE_MUSIC' }) }));
  useFriendRequests.setState({
    count: 0,
    unseen: 0,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  api.listReceived.mockResolvedValue(page([]));
  api.listSent.mockResolvedValue(page([]));
  api.markRecommendationsSeen.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  resetAuthStore();
});

describe('Recommendations', () => {
  it('shows skeletons while loading', () => {
    // Arrange
    api.listReceived.mockReturnValue(new Promise(() => {}));

    // Act
    renderScreen();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading recommendations' })).toBeInTheDocument();
    expect(api.markRecommendationsSeen).not.toHaveBeenCalled();
  });

  it('opens on Received, marks it seen once loaded, and refreshes the badge', async () => {
    // Arrange
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    const { refresh } = useFriendRequests.getState();

    // Act
    renderScreen();

    // Assert
    const card = (await screen.findByText('Song 1')).closest('article')!;
    expect(within(card).getByText('From')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Dana' })).toBeInTheDocument();
    expect(within(card).getByText('Open in Apple Music')).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api.markRecommendationsSeen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Received' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('a failed mark-seen is silent', async () => {
    // Arrange
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    api.markRecommendationsSeen.mockRejectedValue(networkError());

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('switches to Sent, which names the recipient and does not mark anything seen', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listSent.mockResolvedValue(
      page([outbound(1, { ratingSummary: { average: 8, count: 1 } })]),
    );
    renderScreen();
    await screen.findByText('Nothing here yet');
    api.markRecommendationsSeen.mockClear();

    // Act
    await user.click(sentTab());

    // Assert
    const card = (await screen.findByText('Sent 1')).closest('article')!;
    expect(within(card).getByText('To')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Dana' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /★ 8/ })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Rate/ })).not.toBeInTheDocument();
    expect(api.markRecommendationsSeen).not.toHaveBeenCalled();
  });

  it('shows each empty state', async () => {
    // Arrange
    const user = userEvent.setup();
    renderScreen();

    // Act & Assert
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    await user.click(sentTab());
    expect(await screen.findByText("You haven't sent anything")).toBeInTheDocument();
  });

  it('Load more appends the next page', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived
      .mockResolvedValueOnce(page([inbound(1)], 'next'))
      .mockResolvedValueOnce(page([inbound(2)]));
    renderScreen();

    // Act
    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByText('Song 2')).toBeInTheDocument();
    expect(screen.getByText('Song 1')).toBeInTheDocument();
    expect(api.listReceived).toHaveBeenLastCalledWith('next');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('a Load more failure offers Try again and keeps the list', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived
      .mockResolvedValueOnce(page([inbound(1)], 'next'))
      .mockRejectedValueOnce(networkError());
    renderScreen();

    // Act
    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load more songs.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByText('Song 1')).toBeInTheDocument();
  });

  it('a load error offers Try again, with Send still usable', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockRejectedValueOnce(networkError());
    renderScreen();

    // Act
    expect(await screen.findByText("Couldn't load your recommendations.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a song' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('offline shows the banner and disables every write', async () => {
    // Arrange
    setOnline(false);
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    const user = userEvent.setup();
    renderScreen();

    // Act
    const card = (await screen.findByText('Song 1')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Post options' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You're offline. Connect to send or change anything.",
    );
    expect(screen.getByRole('button', { name: 'Send a song' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: /Rate & Review/ })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Hide' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: /Listen Later/ })).toBeDisabled();
  });

  it('rating from Received replaces the card with the score', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    ratePost.mockResolvedValue({});
    getPost.mockResolvedValue({ post: inbound(1, { myScore: 8 }), community: null });
    renderScreen();

    // Act
    await user.click(await screen.findByRole('button', { name: /Rate & Review/ }));
    const sheet = screen.getByRole('dialog', { name: 'Rate & Review' });
    await user.click(within(sheet).getByRole('radio', { name: '8 out of 10' }));
    await user.click(within(sheet).getByRole('button', { name: 'Submit Rating' }));

    // Assert
    expect(await screen.findByText('You: 8')).toBeInTheDocument();
    expect(ratePost).toHaveBeenCalledWith('in-1', { score: 8, comment: null });
    expect(screen.queryByRole('button', { name: /Rate & Review/ })).not.toBeInTheDocument();
  });

  it('a card deleted before the rating leaves the list', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    ratePost.mockRejectedValue(httpError(404, 'Post not found.'));
    getPost.mockRejectedValue(httpError(404, 'Post not found.'));
    renderScreen();

    // Act
    await user.click(await screen.findByRole('button', { name: /Rate & Review/ }));
    const sheet = screen.getByRole('dialog', { name: 'Rate & Review' });
    await user.click(within(sheet).getByRole('radio', { name: '8 out of 10' }));
    await user.click(within(sheet).getByRole('button', { name: 'Submit Rating' }));

    // Assert
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('a refused rating closes the sheet and reloads the list', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived
      .mockResolvedValueOnce(page([inbound(1)]))
      .mockResolvedValueOnce(page([inbound(1, { direct: { recipient: NOAM, isFriend: false } })]));
    ratePost.mockRejectedValue(httpError(403, 'You can only rate songs from friends.'));
    renderScreen();

    // Act
    await user.click(await screen.findByRole('button', { name: /Rate & Review/ }));
    const sheet = screen.getByRole('dialog', { name: 'Rate & Review' });
    await user.click(within(sheet).getByRole('radio', { name: '8 out of 10' }));
    await user.click(within(sheet).getByRole('button', { name: 'Submit Rating' }));

    // Assert
    expect(await screen.findByText("You're no longer friends with Dana")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith('You can only rate songs from friends.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('after unfriending the card has no rate button, and can still be saved', async () => {
    // Arrange
    api.listReceived.mockResolvedValue(
      page([inbound(1, { direct: { recipient: NOAM, isFriend: false } })]),
    );

    // Act
    renderScreen();

    // Assert
    const card = (await screen.findByText('Song 1')).closest('article')!;
    expect(within(card).getByText("You're no longer friends with Dana")).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Rate & Review/ })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Listen Later/ })).toBeEnabled();
  });

  it('Hide confirms, then the card leaves Received', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    api.hideRecommendation.mockResolvedValue(undefined);
    renderScreen();

    // Act
    const card = (await screen.findByText('Song 1')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Post options' }));
    await user.click(within(card).getByRole('button', { name: 'Hide' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Hide' })).getByRole('button', { name: 'Hide' }),
    );

    // Assert
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    expect(api.hideRecommendation).toHaveBeenCalledWith('in-1');
  });

  it('the recipient is offered no delete, and the sender no hide', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listReceived.mockResolvedValue(page([inbound(1)]));
    api.listSent.mockResolvedValue(page([outbound(1)]));
    renderScreen();

    // Act
    const received = (await screen.findByText('Song 1')).closest('article')!;
    await user.click(within(received).getByRole('button', { name: 'Post options' }));

    // Assert
    expect(within(received).queryByRole('button', { name: 'Delete post' })).toBeNull();

    // Act
    await user.click(sentTab());
    const sent = (await screen.findByText('Sent 1')).closest('article')!;
    await user.click(within(sent).getByRole('button', { name: 'Post options' }));

    // Assert
    expect(within(sent).queryByRole('button', { name: 'Hide' })).toBeNull();
    expect(within(sent).getByRole('button', { name: 'Delete post' })).toBeInTheDocument();
  });

  it('the sender deletes after a confirmation that names the other person', async () => {
    // Arrange
    const user = userEvent.setup();
    api.listSent.mockResolvedValue(page([outbound(1)]));
    deletePost.mockResolvedValue(undefined);
    renderScreen();
    await screen.findByText('Nothing here yet');

    // Act
    await user.click(sentTab());
    const card = (await screen.findByText('Sent 1')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Post options' }));
    await user.click(within(card).getByRole('button', { name: 'Delete post' }));
    const sheet = screen.getByRole('dialog', { name: 'Delete post' });

    // Assert
    expect(
      within(sheet).getByText(
        "Delete this recommendation? Dana will lose it too, with any rating. They won't be notified.",
      ),
    ).toBeInTheDocument();

    // Act
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }));

    // Assert
    expect(await screen.findByText("You haven't sent anything")).toBeInTheDocument();
  });

  it('a pending item shows the quiet note, and only the sender can retry', async () => {
    // Arrange
    const user = userEvent.setup();
    const { id: _id, ...pending } = makePendingPost();
    api.listReceived.mockResolvedValue(
      page([{ ...pending, id: 'in-1', author: DANA, direct: { recipient: NOAM, isFriend: true } }]),
    );
    api.listSent.mockResolvedValue(
      page([
        {
          ...pending,
          id: 'out-1',
          author: NOAM,
          isMine: true,
          canDelete: true,
          direct: { recipient: DANA, isFriend: true },
        },
      ]),
    );
    renderScreen();

    // Act & Assert
    expect(await screen.findByText('Other services unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find on other services' })).toBeNull();
    await user.click(sentTab());
    expect(
      await screen.findByRole('button', { name: 'Find on other services' }),
    ).toBeInTheDocument();
  });

  it('sending from Sent closes the sheet and reloads the list', async () => {
    // Arrange
    const user = userEvent.setup();
    listFriends.mockResolvedValue([{ user: DANA, since: '2026-10-06T10:00:00.000Z' }]);
    api.sendRecommendation.mockResolvedValue(outbound(1));
    api.listSent.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([outbound(1)]));
    renderScreen();
    await screen.findByText('Nothing here yet');
    await user.click(sentTab());
    await screen.findByText("You haven't sent anything");

    // Act
    await user.click(screen.getByRole('button', { name: 'Send a song' }));
    const sheet = screen.getByRole('dialog', { name: 'Send a song' });
    await user.click(await within(sheet).findByRole('button', { name: 'Dana' }));
    await user.type(
      within(sheet).getByLabelText('Song or album link'),
      'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Send' }));

    // Assert
    expect(await screen.findByText('Sent 1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links back to Friends', async () => {
    // Arrange
    const user = userEvent.setup();
    renderScreen();

    // Act
    await user.click(screen.getByRole('link', { name: 'Friends' }));

    // Assert
    expect(screen.getByText('Friends screen')).toBeInTheDocument();
  });
});
