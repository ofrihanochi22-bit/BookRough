import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPostRating } from '../api/ratings';
import { useAuthStore } from '../stores/auth';
import {
  httpError,
  makePost,
  makeSession,
  makeUser,
  networkError,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { PostDetail } from './PostDetail';

const { getPost, deletePost, listPostRatings, editRating, toastSuccess } = vi.hoisted(() => ({
  getPost: vi.fn(),
  deletePost: vi.fn(),
  listPostRatings: vi.fn(),
  editRating: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('../api/posts', () => ({ getPost, deletePost, retryConversion: vi.fn() }));
vi.mock('../api/ratings', () => ({ listPostRatings, editRating, ratePost: vi.fn() }));
vi.mock('../api/bookmarks', () => ({ saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: vi.fn() } }));

const POST = makePost({ myScore: 6, ratingSummary: { average: 7.5, count: 2 } });
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

const RATINGS = {
  ratingSummary: { average: 7.5, count: 2 },
  ratings: [
    rating({ id: 'mine', isMine: true, score: 6, comment: 'nise song' }),
    rating({ id: 'noa', score: 9, comment: 'A classic.\nStill gives me chills.' }),
  ],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/posts/${POST.id}`]}>
      <Routes>
        <Route path="/posts/:postId" element={<PostDetail />} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const ratingsRegion = () => screen.getByRole('region', { name: 'Ratings' });

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore
    .getState()
    .setSession(makeSession({ user: makeUser({ preferredService: 'SPOTIFY' }) }));
  getPost.mockResolvedValue({ post: POST, community: COMMUNITY });
  listPostRatings.mockResolvedValue(RATINGS);
});

afterEach(() => {
  resetAuthStore();
});

describe('PostDetail (post-detail.md §5.2)', () => {
  it('shows skeletons while loading', () => {
    // Arrange
    getPost.mockReturnValue(new Promise(() => {}));
    listPostRatings.mockReturnValue(new Promise(() => {}));

    // Act
    renderDetail();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the post' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading ratings' })).toBeInTheDocument();
  });

  it('shows the card, the average and every rating, with Edit on yours only', async () => {
    // Act
    renderDetail();

    // Assert
    expect(await screen.findByRole('link', { name: '← Friday Jazz' })).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY.id}`,
    );
    expect(screen.getByText('You rated 6/10')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View ratings' })).not.toBeInTheDocument();
    const region = ratingsRegion();
    expect(await within(region).findByText('7.5')).toBeInTheDocument();
    expect(within(region).getByText('out of 10 · 2 ratings')).toBeInTheDocument();
    const rows = within(region).getAllByRole('listitem');
    expect(within(rows[0]!).getByText('You')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('6/10')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Noa')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/Still gives me chills/)).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('says "No ratings yet" when nobody has rated', async () => {
    // Arrange
    getPost.mockResolvedValue({ post: makePost(), community: COMMUNITY });
    listPostRatings.mockResolvedValue({
      ratingSummary: { average: null, count: 0 },
      ratings: [],
    });

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByText('No ratings yet')).toBeInTheDocument();
  });

  it('edits your rating in the pre-filled sheet, then reloads the list and the card', async () => {
    // Arrange
    editRating.mockResolvedValue({});
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const sheet = screen.getByRole('dialog', { name: 'Edit your rating' });
    expect(within(sheet).getByRole('radio', { name: '6' })).toHaveAttribute('aria-checked', 'true');

    // Act
    await userEvent.click(within(sheet).getByRole('radio', { name: '9' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));

    // Assert
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Rating updated'));
    expect(editRating).toHaveBeenCalledWith(POST.id, { score: 9, comment: 'nise song' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(listPostRatings).toHaveBeenCalledTimes(2));
    expect(getPost).toHaveBeenCalledTimes(2);
  });

  it('shows the not-found page for a post you cannot see', async () => {
    // Arrange
    getPost.mockRejectedValue(httpError(404, 'Post not found.'));
    listPostRatings.mockRejectedValue(httpError(404, 'Post not found.'));

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByText("This page doesn't exist")).toBeInTheDocument();
  });

  it('shows the not-found page when an edit finds the post gone', async () => {
    // Arrange
    editRating.mockRejectedValue(httpError(404, 'Post not found.'));
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    expect(await screen.findByText("This page doesn't exist")).toBeInTheDocument();
  });

  it("keeps the card when the ratings fail, with UC-16's message and Try again", async () => {
    // Arrange
    listPostRatings.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(RATINGS);
    renderDetail();

    // Assert
    expect(await screen.findByText('Could not load comments at this time.')).toBeInTheDocument();
    expect(screen.getByText('You rated 6/10')).toBeInTheDocument();
    expect(within(ratingsRegion()).getByText('7.5')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await within(ratingsRegion()).findByText('Noa')).toBeInTheDocument();
  });

  it('disables Edit offline, keeping the ratings readable', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderDetail();

    // Assert
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByText('Noa')).toBeInTheDocument();
  });

  it('returns to the community after deleting the post from its menu', async () => {
    // Arrange
    getPost.mockResolvedValue({ post: { ...POST, canDelete: true }, community: COMMUNITY });
    deletePost.mockResolvedValue(undefined);
    renderDetail();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Post options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete post' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    // Assert
    expect(await screen.findByText('Community screen')).toBeInTheDocument();
  });
});
