import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { CONVERTING_COPY } from '../lib/postText';
import {
  PENDING_NOTICE,
  RETRY_ERROR_NOTICE,
  RETRY_FAILED_NOTICE,
  STILL_PENDING_NOTICE,
} from '../hooks/useRetryConversion';
import { type StreamingService, useAuthStore } from '../stores/auth';
import {
  httpError,
  makeLinkOnlyPost,
  makePendingPost,
  makePost,
  makeSession,
  makeUser,
  networkError,
  resetAuthStore,
} from '../test/fixtures';
import { USER_AGENTS, emulateDevice, resetDevice } from '../test/userAgents';
import { PostCard } from './PostCard';

/** The card links to Post Detail, so it renders inside a router. */
const inRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const { retryConversion, deletePost, saveBookmark, removeBookmark, toastSuccess, toastError } =
  vi.hoisted(() => ({
    retryConversion: vi.fn(),
    deletePost: vi.fn(),
    saveBookmark: vi.fn(),
    removeBookmark: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }));
vi.mock('../api/posts', () => ({ retryConversion, deletePost, editPostComment: vi.fn() }));
vi.mock('../api/bookmarks', () => ({ saveBookmark, removeBookmark }));
const { checkInBackground } = vi.hoisted(() => ({ checkInBackground: vi.fn() }));
vi.mock('../api/recommendations', () => ({ checkInBackground }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: toastError } }));

function renderCard(
  post: PublicPost,
  viewerService: StreamingService | null = 'APPLE_MUSIC',
  online = true,
) {
  const onUpdated = vi.fn();
  const onStale = vi.fn();
  const onDeleted = vi.fn();
  const onBookmarkChanged = vi.fn();
  inRouter(
    <PostCard
      post={post}
      viewerService={viewerService}
      online={online}
      onUpdated={onUpdated}
      onStale={onStale}
      onDeleted={onDeleted}
      onBookmarkChanged={onBookmarkChanged}
    />,
  );
  return { onUpdated, onStale, onDeleted, onBookmarkChanged };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PostCard — converted', () => {
  it("shows the song, the author, the comment, and opens the viewer's service", () => {
    // Act
    renderCard(makePost({ comment: 'Line one\nLine two' }));

    // Assert
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getByText('Queen')).toBeInTheDocument();
    expect(screen.getByText('Dana')).toBeInTheDocument();
    expect(screen.getByText(/Line one/).textContent).toBe('Line one\nLine two');
    const open = screen.getByRole('link', { name: 'Open in Apple Music' });
    expect(open).toHaveAttribute('href', 'https://music.apple.com/us/album/x/1?i=2');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('Album')).not.toBeInTheDocument();
  });

  it('labels an album and says "You" on your own post', () => {
    // Act
    renderCard(makePost({ kind: 'ALBUM', isMine: true }));

    // Assert
    expect(screen.getByText('Album')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it("falls back to the original link when the viewer's service has none", () => {
    // Act
    renderCard(makePost(), 'TIDAL');

    // Assert
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    );
  });

  it('lists every found link in the Other services sheet', async () => {
    // Arrange
    renderCard(makePost());

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Other services' }));

    // Assert
    const sheet = screen.getByRole('dialog', { name: 'Other services' });
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Spotify', 'Apple Music', 'Deezer']);
  });

  it('in the installed iOS app, asks over Other services and leaves it open on Cancel', async () => {
    // Arrange (open-in-safari.md §5.4)
    emulateDevice(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5, standalone: true });
    onTestFinished(resetDevice);
    renderCard(makePost());
    await userEvent.click(screen.getByRole('button', { name: 'Other services' }));
    const services = screen.getByRole('dialog', { name: 'Other services' });

    // Act
    await userEvent.click(within(services).getByRole('link', { name: 'Deezer' }));
    const asked = screen.getByRole('dialog', { name: 'Open in browser?' });
    await userEvent.click(within(asked).getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(screen.queryByRole('dialog', { name: 'Open in browser?' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Other services' })).toBeInTheDocument();
  });

  it('replaces a cover that fails to load with the placeholder', () => {
    // Arrange
    const { container } = inRouter(
      <PostCard
        post={makePost()}
        viewerService="SPOTIFY"
        online
        onUpdated={vi.fn()}
        onStale={vi.fn()}
        onDeleted={vi.fn()}
        onBookmarkChanged={vi.fn()}
      />,
    );
    const image = container.querySelector('img[src="https://img.example/cover.jpg"]')!;

    // Act
    fireEvent.error(image);

    // Assert
    expect(container.querySelector('img[src="https://img.example/cover.jpg"]')).toBeNull();
    expect(screen.getByText('♪')).toBeInTheDocument();
  });
});

describe('PostCard author (find-people.md §5.3)', () => {
  it("links the author's avatar and name to their profile", () => {
    // Act
    renderCard(makePost());

    // Assert
    expect(screen.getByRole('link', { name: 'Dana' })).toHaveAttribute(
      'href',
      '/users/a1b2c3d4-0000-4000-8000-000000000001',
    );
  });

  it('links "You" to My Profile on your own post', () => {
    // Arrange
    const post = makePost({ isMine: true });
    useAuthStore.getState().setSession(makeSession({ user: makeUser({ id: post.author.id }) }));

    // Act
    renderCard(post);

    // Assert
    expect(screen.getByRole('link', { name: 'You' })).toHaveAttribute('href', '/profile');
    cleanup();
    resetAuthStore();
  });
});

describe('PostCard — pending', () => {
  const TRY_AGAIN = 'Try again to convert this link';

  it('says conversion failed, links to the original, and offers Try again to a non-author', () => {
    // Act
    renderCard(makePendingPost());

    // Assert
    expect(screen.getByText('Shared from Spotify')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(PENDING_NOTICE);
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other services' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: TRY_AGAIN })).toBeEnabled();
  });

  it('offers Try again to the author too', () => {
    // Act
    renderCard(makePendingPost({ isMine: true }));

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(PENDING_NOTICE);
    expect(screen.getByRole('button', { name: TRY_AGAIN })).toBeEnabled();
  });

  it('lets a viewer retry: the designed wait, then the converted post', async () => {
    // Arrange
    let resolve: (value: unknown) => void = () => undefined;
    retryConversion.mockReturnValue(new Promise((r) => (resolve = r)));
    const post = makePendingPost();
    const { onUpdated } = renderCard(post);

    // Act
    await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN }));

    // Assert
    expect(screen.getByRole('button', { name: CONVERTING_COPY })).toBeDisabled();
    const converted = makePost({ id: post.id });
    resolve(converted);
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(converted));
    expect(retryConversion).toHaveBeenCalledWith(post.id);
  });

  it('replaces the notice when it is still pending, and Try again stays available', async () => {
    // Arrange
    const post = makePendingPost({ isMine: true });
    retryConversion.mockResolvedValue(post);
    renderCard(post);

    // Act
    await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN }));

    // Assert
    expect(await screen.findByText(STILL_PENDING_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_NOTICE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: TRY_AGAIN })).toBeEnabled();
  });

  it.each([404, 409])('asks the feed to reload on %i', async (status) => {
    // Arrange
    retryConversion.mockRejectedValue(httpError(status, 'x'));
    const { onStale } = renderCard(makePendingPost({ isMine: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN }));

    // Assert
    await vi.waitFor(() => expect(onStale).toHaveBeenCalled());
  });

  it.each([
    ['a network failure', networkError(), RETRY_FAILED_NOTICE],
    ['a server error', httpError(500, 'x'), RETRY_ERROR_NOTICE],
    ['the rate limit', httpError(429, 'x'), RETRY_ERROR_NOTICE],
  ])('says it could not try again on %s', async (_label, error, notice) => {
    // Arrange
    retryConversion.mockRejectedValue(error);
    renderCard(makePendingPost());

    // Act
    await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN }));

    // Assert
    expect(await screen.findByText(notice)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TRY_AGAIN })).toBeEnabled();
  });

  it('disables Try again offline', () => {
    // Act
    renderCard(makePendingPost(), 'SPOTIFY', false);

    // Assert
    expect(screen.getByRole('button', { name: TRY_AGAIN })).toBeDisabled();
  });
});

describe('PostCard — deleting', () => {
  async function openDelete() {
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    return screen.getByRole('dialog', { name: 'Delete post' });
  }

  it('offers no menu on a post the viewer may not delete', () => {
    // Act
    renderCard(makePost({ canDelete: false }));

    // Assert
    expect(screen.queryByRole('button', { name: 'Post options' })).not.toBeInTheDocument();
  });

  it("asks UC-18's question for your own post", async () => {
    // Arrange
    renderCard(makePost({ canDelete: true, isMine: true }));

    // Act
    const sheet = await openDelete();

    // Assert
    expect(sheet).toHaveTextContent(
      'Are you sure you want to delete this recommendation? This will also delete all ratings and comments associated with it.',
    );
  });

  it("names the author, and says they won't be told, for someone else's post", async () => {
    // Arrange
    renderCard(makePost({ canDelete: true }));

    // Act
    const sheet = await openDelete();

    // Assert
    expect(sheet).toHaveTextContent(
      "Delete Dana's recommendation? This will also delete all ratings and comments on it. Dana won't be notified.",
    );
  });

  it('deletes: Deleting… while waiting, then the toast and the card leaves', async () => {
    // Arrange
    let finish: () => void = () => undefined;
    deletePost.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const post = makePost({ canDelete: true, isMine: true });
    const { onDeleted } = renderCard(post);
    const sheet = await openDelete();

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));

    // Assert
    expect(within(sheet).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    finish();
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(post.id));
    expect(deletePost).toHaveBeenCalledWith(post.id);
    expect(toastSuccess).toHaveBeenCalledWith('Post deleted');
  });

  it("keeps the post and shows UC-18's error when the network fails", async () => {
    // Arrange
    deletePost.mockRejectedValue(networkError());
    const { onDeleted } = renderCard(makePost({ canDelete: true }));
    const sheet = await openDelete();

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));

    // Assert
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Could not delete post. Check your connection and try again.',
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(within(sheet).getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('drops a post that was already deleted', async () => {
    // Arrange
    deletePost.mockRejectedValue(httpError(404, 'Post not found.'));
    const post = makePost({ canDelete: true });
    const { onDeleted } = renderCard(post);
    const sheet = await openDelete();

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));

    // Assert
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(post.id));
    expect(toastSuccess).toHaveBeenCalledWith('This post was already deleted.');
  });

  it('toasts a 403 and reloads the feed', async () => {
    // Arrange
    deletePost.mockRejectedValue(
      httpError(403, 'Only the author or an admin can delete this post.'),
    );
    const { onStale, onDeleted } = renderCard(makePost({ canDelete: true }));
    const sheet = await openDelete();

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));

    // Assert
    await vi.waitFor(() => expect(onStale).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith('Only the author or an admin can delete this post.');
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('cannot delete while offline', async () => {
    // Arrange
    renderCard(makePost({ canDelete: true }), 'SPOTIFY', false);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));

    // Assert
    expect(screen.getByRole('button', { name: 'Delete post' })).toBeDisabled();
  });
});

describe('PostCard bookmark (bookmarks-my-list.md §5.1)', () => {
  const save = () => screen.getByRole('button', { name: 'Save to Listen Later' });

  it("shows an outline icon on someone else's post", () => {
    // Arrange & Act
    renderCard(makePost());

    // Assert
    expect(save()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows no bookmark on your own post', () => {
    // Arrange & Act
    renderCard(makePost({ isMine: true }));

    // Assert
    expect(screen.queryByRole('button', { name: /Listen Later/ })).not.toBeInTheDocument();
  });

  it('fills at once, then toasts and reports the change', async () => {
    // Arrange
    let finish!: () => void;
    saveBookmark.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { onBookmarkChanged } = renderCard(makePost());

    // Act
    await userEvent.click(save());

    // Assert: optimistic, before the server answers.
    const pressed = screen.getByRole('button', { name: 'Remove from Listen Later' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(saveBookmark).toHaveBeenCalledWith(makePost().id);

    // Act
    finish();

    // Assert
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Added to Listen Later'));
    expect(onBookmarkChanged).toHaveBeenCalledWith(makePost().id, true);
  });

  it('ignores a second tap while the first is in flight', async () => {
    // Arrange
    saveBookmark.mockReturnValue(new Promise(() => {}));
    renderCard(makePost());

    // Act
    await userEvent.click(save());
    await userEvent.click(screen.getByRole('button', { name: 'Remove from Listen Later' }));

    // Assert
    expect(saveBookmark).toHaveBeenCalledTimes(1);
    expect(removeBookmark).not.toHaveBeenCalled();
  });

  it('removes a saved post with its own toast', async () => {
    // Arrange
    removeBookmark.mockResolvedValue(undefined);
    const { onBookmarkChanged } = renderCard(makePost({ isBookmarked: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Remove from Listen Later' }));

    // Assert
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Removed from Listen Later'));
    expect(removeBookmark).toHaveBeenCalledWith(makePost().id);
    expect(onBookmarkChanged).toHaveBeenCalledWith(makePost().id, false);
  });

  it("reverts and shows UC-12's message when saving fails", async () => {
    // Arrange
    saveBookmark.mockRejectedValue(networkError());
    const { onBookmarkChanged } = renderCard(makePost());

    // Act
    await userEvent.click(save());

    // Assert
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Failed to save. Please check your connection and try again.',
      ),
    );
    expect(save()).toHaveAttribute('aria-pressed', 'false');
    expect(onBookmarkChanged).not.toHaveBeenCalled();
  });

  it('reverts with its own message when removing fails', async () => {
    // Arrange
    removeBookmark.mockRejectedValue(networkError());
    renderCard(makePost({ isBookmarked: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Remove from Listen Later' }));

    // Assert
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Failed to remove. Please check your connection and try again.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Remove from Listen Later' })).toBeInTheDocument();
  });

  it('a 404 reverts, says the post is gone, and reloads the feed', async () => {
    // Arrange
    saveBookmark.mockRejectedValue(httpError(404, 'Post not found.'));
    const { onStale } = renderCard(makePost());

    // Act
    await userEvent.click(save());

    // Assert
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('This post is no longer available.'),
    );
    expect(onStale).toHaveBeenCalled();
    expect(save()).toHaveAttribute('aria-pressed', 'false');
  });

  it('is disabled offline', () => {
    // Arrange & Act
    renderCard(makePost(), 'APPLE_MUSIC', false);

    // Assert
    expect(save()).toBeDisabled();
  });

  it('a save answered 409 (rated elsewhere) reverts, toasts and reloads the feed', async () => {
    // Arrange
    saveBookmark.mockRejectedValue(httpError(409, 'You already rated this post.'));
    const { onStale, onBookmarkChanged } = renderCard(makePost());

    // Act
    await userEvent.click(save());

    // Assert
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith('You already rated this post.'));
    expect(onStale).toHaveBeenCalled();
    expect(onBookmarkChanged).not.toHaveBeenCalled();
    expect(save()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the discussion size alone when nobody has rated (discussion-threads.md §5.2)', () => {
    // Arrange & Act
    renderCard(makePost({ commentCount: 1 }));

    // Assert
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });
});

describe('PostCard — editing the comment (edit-post-comment.md §5)', () => {
  const RECIPIENT = { id: 'r1', displayName: 'Noam', profilePictureUrl: null };

  it('offers Edit comment to the author, above Delete post, and opens the sheet', async () => {
    // Arrange
    renderCard(makePost({ isMine: true, canDelete: true, comment: 'Old' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    await userEvent.click(screen.getByRole('button', { name: 'Edit comment' }));

    // Assert
    expect(labels.indexOf('Edit comment')).toBeLessThan(labels.indexOf('Delete post'));
    expect(screen.getByRole('dialog', { name: 'Edit comment' })).toBeInTheDocument();
    expect(screen.getByLabelText('Comment')).toHaveValue('Old');
  });

  it('does not offer it to an admin who is not the author', async () => {
    // Arrange
    renderCard(makePost({ isMine: false, canDelete: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));

    // Assert
    expect(screen.queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument();
  });

  it('offers it on a direct item only while the two are friends', async () => {
    // Arrange
    renderCard(
      makePost({
        isMine: true,
        canDelete: true,
        direct: { recipient: RECIPIENT, isFriend: false },
      }),
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));

    // Assert
    expect(screen.queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument();
    cleanup();

    // Arrange
    renderCard(
      makePost({ isMine: true, canDelete: true, direct: { recipient: RECIPIENT, isFriend: true } }),
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));

    // Assert
    expect(screen.getByRole('button', { name: 'Edit comment' })).toBeInTheDocument();
  });

  it('marks an edited comment, and not an unedited one', () => {
    // Arrange & Act
    renderCard(makePost({ commentEditedAt: '2026-11-08T10:00:00.000Z' }));

    // Assert
    expect(screen.getByText('· edited')).toBeInTheDocument();
    cleanup();

    // Arrange & Act
    renderCard(makePost());

    // Assert
    expect(screen.queryByText('· edited')).not.toBeInTheDocument();
  });
});

describe('PostCard — user text and links (manual-test-fixes-1122.md §5)', () => {
  it('lays out the title, artist and comment in their own direction, and isolates the author', () => {
    // Act
    renderCard(
      makePost({
        title: 'שיר לשבת',
        artist: 'אריק איינשטיין',
        comment: 'הקלאסיקות של פעם, בלי פשרות.',
        author: { id: 'a1', displayName: 'דנה', profilePictureUrl: null },
      }),
    );

    // Assert
    expect(screen.getByText('שיר לשבת').closest('p')).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('אריק איינשטיין')).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('הקלאסיקות של פעם, בלי פשרות.')).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('דנה').tagName).toBe('BDI');
  });

  it('keeps English text left-to-right: no dir="rtl" anywhere on the card', () => {
    // Act
    const { container } = render(
      <MemoryRouter>
        <PostCard
          post={makePost({ comment: 'An English comment.' })}
          viewerService="SPOTIFY"
          online
          onUpdated={vi.fn()}
          onStale={vi.fn()}
          onDeleted={vi.fn()}
          onBookmarkChanged={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Assert
    expect(container.querySelector('[dir="rtl"]')).toBeNull();
    expect(container.querySelector('[dir="ltr"]')).toBeNull();
  });

  it('opens the main service button in a new tab', () => {
    // Act
    renderCard(makePost());

    // Assert
    const open = screen.getByRole('link', { name: 'Open in Apple Music' });
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it("opens a link-only post's button in a new tab", () => {
    // Act
    renderCard(
      makeLinkOnlyPost({
        originalUrl: 'https://artist.bandcamp.com/album/x',
        platform: 'BANDCAMP',
        kind: 'ALBUM',
      }),
    );

    // Assert
    const open = screen.getByRole('link', { name: /Bandcamp/ });
    expect(open).toHaveAttribute('href', 'https://artist.bandcamp.com/album/x');
    expect(open).toHaveAttribute('target', '_blank');
  });

  it('opens every Other services link in a new tab', async () => {
    // Arrange
    renderCard(makePost());

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Other services' }));

    // Assert
    const links = within(screen.getByRole('dialog', { name: 'Other services' })).getAllByRole(
      'link',
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});

describe('PostCard — From communities (community-unchecked.md §5)', () => {
  it('opening the main link checks the post in the background', async () => {
    // Arrange
    const post = makePost();
    renderCard(post);

    // Act
    fireEvent.click(screen.getByRole('link', { name: /Open in/ }));

    // Assert
    expect(checkInBackground).toHaveBeenCalledWith(post);
  });

  it('opening a link in Other services checks it too', async () => {
    // Arrange
    const post = makePost();
    renderCard(post);
    await userEvent.click(screen.getByRole('button', { name: 'Other services' }));

    // Act
    const sheet = screen.getByRole('dialog');
    fireEvent.click(within(sheet).getAllByRole('link')[0]!);

    // Assert
    expect(checkInBackground).toHaveBeenCalledWith(post);
  });

  it('shows Mark checked only when the list offers it, disabled offline', async () => {
    // Arrange
    const post = makePost();
    const onCheck = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <PostCard
          post={post}
          viewerService="SPOTIFY"
          online
          onUpdated={vi.fn()}
          onStale={vi.fn()}
          onDeleted={vi.fn()}
          onBookmarkChanged={vi.fn()}
          onCheck={onCheck}
          onRate={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Mark checked' }));
    rerender(
      <MemoryRouter>
        <PostCard
          post={post}
          viewerService="SPOTIFY"
          online={false}
          onUpdated={vi.fn()}
          onStale={vi.fn()}
          onDeleted={vi.fn()}
          onBookmarkChanged={vi.fn()}
          onCheck={onCheck}
          onRate={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Assert
    expect(onCheck).toHaveBeenCalledWith(post);
    expect(screen.getByRole('button', { name: 'Mark checked' })).toBeDisabled();
    // A community post can be rated here: there is no friendship to lose.
    expect(screen.getByRole('button', { name: /Rate & Review/ })).toBeInTheDocument();
    expect(screen.queryByText(/no longer friends/)).not.toBeInTheDocument();
  });

  it('has no Mark checked elsewhere', () => {
    // Act
    renderCard(makePost());

    // Assert
    expect(screen.queryByRole('button', { name: 'Mark checked' })).not.toBeInTheDocument();
  });
});
