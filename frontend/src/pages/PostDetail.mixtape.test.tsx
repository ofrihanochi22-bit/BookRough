import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicComment } from '../api/comments';
import type { PublicPostRating } from '../api/ratings';
import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makePost,
  makeSession,
  makeUser,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { PostDetail } from './PostDetail';

const { getPost, listPostRatings, comments } = vi.hoisted(() => ({
  comments: {
    listComments: vi.fn(),
    addComment: vi.fn(),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
  },
  getPost: vi.fn(),
  listPostRatings: vi.fn(),
}));
vi.mock('../api/posts', () => ({
  getPost,
  deletePost: vi.fn(),
  editPostComment: vi.fn(),
  retryConversion: vi.fn(),
}));
vi.mock('../api/ratings', () => ({ listPostRatings, editRating: vi.fn(), ratePost: vi.fn() }));
vi.mock('../api/comments', () => comments);
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));

const POST = makePost({
  title: 'Blue in Green',
  myScore: 6,
  ratingSummary: { average: 7.5, count: 2 },
});
const COMMUNITY = { id: '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40', name: 'Friday Jazz' };

function rating(overrides: Partial<PublicPostRating>): PublicPostRating {
  return {
    id: 'r1',
    rater: { id: 'u1', displayName: 'Noa', profilePictureUrl: null },
    isMine: false,
    score: 9,
    comment: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  };
}

function comment(overrides: Partial<PublicComment>): PublicComment {
  return {
    id: 'c1',
    author: { id: 'u2', displayName: 'Dana', profilePictureUrl: null },
    body: 'Love this one',
    deleted: false,
    createdAt: '2026-11-09T10:00:00.000Z',
    editedAt: null,
    ratingId: null,
    parentId: null,
    replyTo: null,
    isMine: false,
    canDelete: false,
    ...overrides,
  };
}

const RATINGS = {
  ratingSummary: { average: 7.5, count: 2 },
  ratings: [
    rating({ id: 'mine', isMine: true, score: 6, comment: 'nice song' }),
    rating({ id: 'noa', score: 9, comment: 'A classic.' }),
  ],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/posts/${POST.id}`]}>
      <Routes>
        <Route path="/posts/:postId" element={<PostDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession({ user: makeUser() }));
  getPost.mockResolvedValue({ post: POST, community: COMMUNITY });
  listPostRatings.mockResolvedValue(RATINGS);
  comments.listComments.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  resetAuthStore();
});

describe('Post Detail (ui-redesign.md §5.3)', () => {
  it('shows the back link beside the logo, and the song as the h1 with a full-width cover', async () => {
    // Act
    renderDetail();

    // Assert
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Blue in Green' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Friday Jazz' })).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY.id}`,
    );
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(document.querySelector('article img')?.className).toContain('w-full');
  });

  it('carries the average on the large sticker, with the You tag, and no average block', async () => {
    // Act
    renderDetail();

    // Assert
    const sticker = await screen.findByRole('img', { name: '★ 7.5 · 2 ratings' });
    expect(sticker.className).toContain('size-20');
    expect(screen.getByText('You: 6')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Ratings' })).toBeInTheDocument();
    expect(screen.queryByText(/out of 10/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /comments/i })).not.toBeInTheDocument();
  });

  it('shows each rating as a card with a score sticker, Edit only on yours', async () => {
    // Act
    renderDetail();

    // Assert
    const region = screen.getByRole('region', { name: 'Ratings' });
    const cards = await within(region).findAllByRole('listitem');
    expect(within(cards[0]!).getByRole('img', { name: '6/10' })).toBeInTheDocument();
    expect(within(cards[0]!).getByText('You')).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(within(cards[1]!).getByRole('img', { name: '9/10' })).toBeInTheDocument();
    expect(within(cards[1]!).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('opens the rating sheet from Edit', async () => {
    // Arrange
    renderDetail();
    const region = screen.getByRole('region', { name: 'Ratings' });
    const mine = (await within(region).findAllByRole('listitem'))[0]!;

    // Act
    await userEvent.click(within(mine).getByRole('button', { name: 'Edit' }));

    // Assert
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows the Edit chip and Send in the dashed offline treatment when offline', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderDetail();

    // Assert
    const region = screen.getByRole('region', { name: 'Ratings' });
    const mine = (await within(region).findAllByRole('listitem'))[0]!;
    const edit = within(mine).getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    expect(edit.className).toContain('border-dashed');
    const send = await screen.findByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    expect(send.className).toContain('border-dashed');
  });

  it('says "No ratings yet" when there are none', async () => {
    // Arrange
    const unrated = { ...POST, myScore: null, ratingSummary: { average: null, count: 0 } };
    getPost.mockResolvedValue({ post: unrated, community: COMMUNITY });
    listPostRatings.mockResolvedValue({ ratingSummary: unrated.ratingSummary, ratings: [] });

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByText('No ratings yet')).toBeInTheDocument();
    expect(screen.queryByTestId('rating-sticker')).not.toBeInTheDocument();
  });

  it('stacks post, ratings, threads and comments, with the comment composer last', async () => {
    // Arrange
    comments.listComments.mockResolvedValue([
      comment({ id: 'reply', ratingId: 'noa', body: 'Agreed!' }),
      comment({ id: 'c1', body: 'Love this one' }),
    ]);

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByText('Agreed!')).toBeInTheDocument();
    const discussion = screen.getByRole('region', { name: 'Discussion' });
    expect(within(discussion).getByRole('heading', { name: 'Comments' })).toBeInTheDocument();
    const ratings = screen.getByRole('region', { name: 'Ratings' });
    const article = screen.getByRole('article');
    expect(article.compareDocumentPosition(ratings)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(ratings.compareDocumentPosition(discussion)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(ratings).getByText('Agreed!')).toBeInTheDocument();
    const loveIt = within(discussion).getByText('Love this one');
    const field = within(discussion).getByLabelText('Add a comment');
    expect(loveIt.compareDocumentPosition(field)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows a full-width square skeleton while the post loads', () => {
    // Arrange
    getPost.mockReturnValue(new Promise(() => {}));
    listPostRatings.mockReturnValue(new Promise(() => {}));

    // Act
    renderDetail();

    // Assert
    const loading = screen.getByRole('status', { name: 'Loading the post' });
    expect(loading.firstElementChild?.className).toContain('aspect-square');
    expect(screen.getByRole('status', { name: 'Loading ratings' })).toBeInTheDocument();
  });

  it('shows the load error, and not-found on a 404', async () => {
    // Arrange
    getPost.mockRejectedValueOnce(httpError(500, 'Boom'));

    // Act
    const { unmount } = renderDetail();

    // Assert
    expect(await screen.findByText("Couldn't load this post.")).toBeInTheDocument();
    unmount();
    getPost.mockRejectedValue(httpError(404, 'Post not found.'));
    renderDetail();
    expect(
      await screen.findByRole('heading', { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
  });
});
