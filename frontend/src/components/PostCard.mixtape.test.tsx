import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import { CONVERTING_COPY } from '../lib/postText';
import { makeLinkOnlyPost, makePendingPost, makePost, makeUser } from '../test/fixtures';
import { PostCard, type PostCardProps } from './PostCard';

const { retryConversion } = vi.hoisted(() => ({ retryConversion: vi.fn() }));
vi.mock('../api/posts', () => ({
  retryConversion,
  deletePost: vi.fn(),
  editPostComment: vi.fn(),
}));
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function renderCard(post: PublicPost, props: Partial<PostCardProps> = {}) {
  const handlers = {
    onUpdated: vi.fn(),
    onStale: vi.fn(),
    onDeleted: vi.fn(),
    onBookmarkChanged: vi.fn(),
  };
  render(
    <MemoryRouter>
      <PostCard post={post} viewerService="APPLE_MUSIC" online {...handlers} {...props} />
    </MemoryRouter>,
  );
  return handlers;
}

const recipient = {
  ...makeUser({ id: 'b0000000-0000-4000-8000-000000000002' }),
  displayName: 'Noa',
};
const receivedDirect = (isFriend = true) => makePost({ direct: { recipient, isFriend } });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PostCard — rating sticker (ui-redesign.md §3.6, §5.0)', () => {
  it('shows the average and the count on a sticker that leads to Post Detail', () => {
    // Act
    renderCard(makePost({ ratingSummary: { average: 7.5, count: 4 } }));

    // Assert
    const sticker = screen.getByRole('link', { name: '★ 7.5 · 4 ratings' });
    expect(sticker).toHaveAttribute('href', `/posts/${makePost().id}`);
    expect(sticker).toHaveTextContent('7.5');
    expect(sticker).toHaveTextContent('4');
  });

  it('abbreviates a large count as the badges do', () => {
    // Act
    renderCard(makePost({ ratingSummary: { average: 10, count: 120 } }));

    // Assert
    const sticker = screen.getByTestId('rating-sticker');
    expect(within(sticker).getByText('10')).toBeInTheDocument();
    expect(within(sticker).getByText('9+')).toBeInTheDocument();
  });

  it('shows no sticker without ratings', () => {
    // Act
    renderCard(makePost());

    // Assert
    expect(screen.queryByTestId('rating-sticker')).not.toBeInTheDocument();
  });

  it('is a picture, not a link, on Post Detail', () => {
    // Act
    renderCard(makePost({ ratingSummary: { average: 8, count: 2 } }), { linkToDetail: false });

    // Assert
    expect(screen.getByRole('img', { name: '★ 8 · 2 ratings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ratings/ })).not.toBeInTheDocument();
  });

  it('tags "You: N" once the viewer rated, with no "You rated" header line', () => {
    // Act
    renderCard(makePost({ myScore: 9, ratingSummary: { average: 9, count: 1 } }));

    // Assert
    expect(screen.getByText('You: 9')).toBeInTheDocument();
    expect(screen.queryByText(/You rated/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Listen Later/ })).not.toBeInTheDocument();
  });
});

describe('PostCard — layout and actions (ui-redesign.md §5.0)', () => {
  it('opens the viewer service as the one primary, with the song in a 116px cover', () => {
    // Act
    renderCard(makePost({ comment: 'Play it loud' }));

    // Assert
    expect(screen.getByRole('link', { name: 'Open in Apple Music' })).toHaveAttribute(
      'href',
      'https://music.apple.com/us/album/x/1?i=2',
    );
    expect(screen.getByRole('link', { name: 'Bohemian Rhapsody' })).toHaveAttribute(
      'href',
      `/posts/${makePost().id}`,
    );
    expect(document.querySelector('img')).toHaveAttribute('width', '116');
    // Tape paper, ringed in light mode so it shows on a white card.
    expect(screen.getByText('Play it loud').className).toContain('bg-tape');
    expect(screen.getByText('Play it loud').className).toContain('ring-line');
    expect(screen.queryByText('View ratings')).not.toBeInTheDocument();
  });

  it('has a comments chip — "N comments", or "Comments" with none — to Post Detail', () => {
    // Act
    renderCard(makePost({ commentCount: 3 }));

    // Assert
    expect(screen.getByRole('link', { name: '3 comments' })).toHaveAttribute(
      'href',
      `/posts/${makePost().id}`,
    );
  });

  it('says "Comments" on the chip when there are none, and no chip on Post Detail', () => {
    // Act
    renderCard(makePost());

    // Assert
    expect(screen.getByRole('link', { name: 'Comments' })).toBeInTheDocument();
  });

  it('shows no comments chip on Post Detail', () => {
    // Act
    renderCard(makePost({ commentCount: 2 }), { linkToDetail: false });

    // Assert
    expect(screen.queryByRole('link', { name: /comments/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bohemian Rhapsody' })).not.toBeInTheDocument();
  });

  it('lists the other services from a chip', async () => {
    // Arrange
    renderCard(makePost());

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Other services' }));

    // Assert
    const sheet = screen.getByRole('dialog', { name: 'Other services' });
    expect(within(sheet).getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('offers no Other services on a link-only post', () => {
    // Act
    renderCard(makeLinkOnlyPost());

    // Assert
    expect(screen.queryByRole('button', { name: 'Other services' })).not.toBeInTheDocument();
    expect(screen.getByText('Set')).toBeInTheDocument();
  });

  it('offers the yellow Rate & Review on a received direct item, and calls onRate', async () => {
    // Arrange
    const onRate = vi.fn();
    const post = receivedDirect();
    renderCard(post, { onRate });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Rate & Review Bohemian Rhapsody' }));

    // Assert
    expect(onRate).toHaveBeenCalledWith(post);
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('says they are no longer friends instead of Rate & Review', () => {
    // Act
    renderCard(receivedDirect(false), { onRate: vi.fn() });

    // Assert
    expect(screen.queryByRole('button', { name: /Rate & Review/ })).not.toBeInTheDocument();
    expect(screen.getByText(/no longer friends/i)).toBeInTheDocument();
  });

  it('dashes Rate & Review while offline', () => {
    // Act
    renderCard(receivedDirect(), { onRate: vi.fn(), online: false });

    // Assert
    const button = screen.getByRole('button', { name: /Rate & Review/ });
    expect(button).toBeDisabled();
    expect(button.className).toContain('border-dashed');
  });
});

describe('PostCard — pending (ui-redesign.md §5.0)', () => {
  it('replaces the cover with still reels and keeps the unavailable line', () => {
    // Act
    renderCard(makePendingPost());

    // Assert
    expect(screen.getByTestId('pending-cover')).toBeInTheDocument();
    expect(screen.getByTestId('reel-cassette')).not.toHaveAttribute('data-spinning');
    expect(screen.getByText('Other services unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Find on other services' }),
    ).not.toBeInTheDocument();
  });

  it("spins the reels while the author's retry runs, then reports the result", async () => {
    // Arrange
    let finish!: (post: PublicPost) => void;
    retryConversion.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const pending = makePendingPost({ isMine: true });
    const { onUpdated } = renderCard(pending);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Find on other services' }));

    // Assert
    expect(screen.getByRole('button', { name: CONVERTING_COPY })).toBeDisabled();
    expect(screen.getByTestId('reel-cassette')).toHaveAttribute('data-spinning', 'true');

    // Act
    finish(pending);

    // Assert
    expect(await screen.findByText('Still unavailable. Try again later.')).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledWith(pending);
  });
});

describe('PostCard — the ⋯ action sheet (ui-redesign.md §5.0)', () => {
  it('shows only the actions the viewer may take', async () => {
    // Arrange: an admin on someone else's post may delete, not edit.
    renderCard(makePost({ canDelete: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));

    // Assert
    const sheet = screen.getByRole('dialog', { name: 'Post options' });
    expect(within(sheet).getByRole('button', { name: 'Delete post' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument();
  });

  it('has no ⋯ when there is nothing to do', () => {
    // Act
    renderCard(makePost());

    // Assert
    expect(screen.queryByRole('button', { name: 'Post options' })).not.toBeInTheDocument();
  });

  it('lists Hide, Edit comment and Delete post, and Cancel closes it', async () => {
    // Arrange
    renderCard(makePost({ isMine: true, canDelete: true }), { onHide: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));
    const sheet = screen.getByRole('dialog', { name: 'Post options' });

    // Assert
    expect(
      within(sheet)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([expect.stringContaining('×'), 'Hide', 'Edit comment', 'Delete post', 'Cancel']);

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leads on to the existing delete confirmation and edit sheet', async () => {
    // Arrange
    renderCard(makePost({ isMine: true, canDelete: true }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete post' }));

    // Assert
    expect(screen.getByRole('dialog', { name: 'Delete post' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Post options' })).not.toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit comment' }));

    // Assert
    expect(screen.getByRole('dialog', { name: /comment/i })).toBeInTheDocument();
  });

  it('calls onHide from the Hide row', async () => {
    // Arrange
    const onHide = vi.fn();
    const post = receivedDirect();
    renderCard(post, { onHide });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));

    // Assert
    expect(onHide).toHaveBeenCalledWith(post);
  });

  it('disables the rows offline', async () => {
    // Arrange
    renderCard(makePost({ isMine: true, canDelete: true }), { online: false });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));

    // Assert
    expect(screen.getByRole('button', { name: 'Delete post' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit comment' })).toBeDisabled();
  });
});
