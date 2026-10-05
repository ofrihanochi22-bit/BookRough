import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { CommunityFeed } from './CommunityFeed';

const { listPosts, createPost, retryConversion } = vi.hoisted(() => ({
  listPosts: vi.fn(),
  createPost: vi.fn(),
  retryConversion: vi.fn(),
}));
vi.mock('../api/posts', () => ({ listPosts, createPost, retryConversion }));

const ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';
const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

const post = (n: number) => makePost({ id: `post-${n}`, title: `Song ${n}` });

function renderFeed() {
  const onGone = vi.fn();
  render(<CommunityFeed communityId={ID} onGone={onGone} />);
  return { onGone };
}

const titles = () =>
  screen.queryAllByText(/^Song \d+$|^New song$/).map((element) => element.textContent);

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

describe('CommunityFeed', () => {
  it('shows post skeletons while loading', () => {
    // Arrange
    listPosts.mockReturnValue(new Promise(() => {}));

    // Act
    renderFeed();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading posts' })).toBeInTheDocument();
    expect(listPosts).toHaveBeenCalledWith(ID);
  });

  it('invites the first post when the feed is empty', async () => {
    // Arrange
    listPosts.mockResolvedValue({ posts: [], nextCursor: null });

    // Act
    renderFeed();

    // Assert
    expect(await screen.findByText('Share the first song')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Share a song' })).toBeInTheDocument();
  });

  it("renders posts with the viewer's own service", async () => {
    // Arrange
    listPosts.mockResolvedValue({ posts: [post(1)], nextCursor: null });

    // Act
    renderFeed();

    // Assert
    expect(await screen.findByRole('link', { name: 'Open in Deezer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('loads more with the cursor and appends', async () => {
    // Arrange
    listPosts
      .mockResolvedValueOnce({ posts: [post(1)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ posts: [post(2)], nextCursor: null });
    renderFeed();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    await vi.waitFor(() => expect(titles()).toEqual(['Song 1', 'Song 2']));
    expect(listPosts).toHaveBeenLastCalledWith(ID, 'c1');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('offers Try again when Load more fails', async () => {
    // Arrange
    listPosts
      .mockResolvedValueOnce({ posts: [post(1)], nextCursor: 'c1' })
      .mockRejectedValueOnce(networkError());
    renderFeed();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByText("Couldn't load more posts.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a load error with Try again, and the composer stays usable', async () => {
    // Arrange
    listPosts
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ posts: [post(1)], nextCursor: null });
    renderFeed();

    // Act
    expect(await screen.findByText("Couldn't load posts.")).toBeInTheDocument();
    expect(screen.getByLabelText('Share a song or album')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
  });

  it('reports a 404 as lost access', async () => {
    // Arrange
    listPosts.mockRejectedValue(httpError(404, 'Community not found.'));

    // Act
    const { onGone } = renderFeed();

    // Assert
    await vi.waitFor(() => expect(onGone).toHaveBeenCalled());
  });

  it('prepends your new post, even when Load more finished during the wait', async () => {
    // Arrange: page 2 arrives while the post is still converting.
    listPosts
      .mockResolvedValueOnce({ posts: [post(1)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ posts: [post(2)], nextCursor: null });
    let finishPost: (value: unknown) => void = () => undefined;
    createPost.mockReturnValue(new Promise((resolve) => (finishPost = resolve)));
    renderFeed();
    await userEvent.type(await screen.findByLabelText('Share a song or album'), TRACK);
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await vi.waitFor(() => expect(titles()).toEqual(['Song 1', 'Song 2']));
    finishPost(makePost({ id: 'new', title: 'New song', isMine: true }));

    // Assert: nothing lost
    await vi.waitFor(() => expect(titles()).toEqual(['New song', 'Song 1', 'Song 2']));
  });

  it('replaces a retried post in place', async () => {
    // Arrange
    const pending = makePendingPost({ id: 'p', isMine: true });
    listPosts.mockResolvedValue({ posts: [pending], nextCursor: null });
    retryConversion.mockResolvedValue(makePost({ id: 'p', title: 'Song 9', isMine: true }));
    renderFeed();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Find on other services' }));

    // Assert
    expect(await screen.findByText('Song 9')).toBeInTheDocument();
    expect(screen.queryByText('Other services unavailable')).not.toBeInTheDocument();
  });

  it('reloads the feed when a retry finds the post changed', async () => {
    // Arrange
    listPosts
      .mockResolvedValueOnce({
        posts: [makePendingPost({ id: 'p', isMine: true })],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ posts: [post(3)], nextCursor: null });
    retryConversion.mockRejectedValue(httpError(409, 'This post already has its links.'));
    renderFeed();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Find on other services' }));

    // Assert
    expect(await screen.findByText('Song 3')).toBeInTheDocument();
  });

  it('shows the offline banner and disables posting, while the feed stays readable', async () => {
    // Arrange
    setOnline(false);
    listPosts.mockResolvedValue({ posts: [post(1)], nextCursor: null });

    // Act
    renderFeed();

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
    expect(screen.getByText("You're offline. Connect to post.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });
});
