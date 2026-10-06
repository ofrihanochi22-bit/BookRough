import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileRating, ProfileUser } from '../api/profiles';
import { PROFILE_FAILED, RATINGS_LOAD_FAILED } from '../lib/profileCopy';
import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, makeUser, networkError, resetAuthStore } from '../test/fixtures';
import { PublicProfile } from './PublicProfile';

const { getProfile, listProfileRatings } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listProfileRatings: vi.fn(),
}));
vi.mock('../api/profiles', () => ({ getProfile, listProfileRatings }));

const VIEWER = makeUser();
const DANA: ProfileUser = {
  id: 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  displayName: 'Dana Levi',
  profilePictureUrl: null,
  preferredService: 'TIDAL',
};

function rating(n: number, overrides: Partial<ProfileRating['post']> = {}): ProfileRating {
  return {
    id: `rating-${n}`,
    score: 8,
    comment: n === 1 ? 'A classic.\nStill gives me chills.' : null,
    createdAt: '2026-10-06T10:00:00.000Z',
    community: { id: 'community-1', name: 'Friday Jazz' },
    post: {
      id: `post-${n}`,
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      title: `Song ${n}`,
      artist: 'Queen',
      coverArtUrl: null,
      conversionPending: false,
      ...overrides,
    },
  };
}

function renderProfile(userId = DANA.id) {
  return render(
    <MemoryRouter initialEntries={[`/users/${userId}`]}>
      <Routes>
        <Route path="/users/:userId" element={<PublicProfile />} />
        <Route path="/profile" element={<p>My Profile screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const ratingsSection = () => screen.getByRole('region', { name: 'Ratings' });

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.getState().setSession(makeSession({ user: VIEWER }));
});

afterEach(() => {
  // Unmount first: resetting the store under a mounted screen re-renders it outside act.
  cleanup();
  resetAuthStore();
});

describe('PublicProfile', () => {
  it('shows skeletons while loading', () => {
    // Arrange
    getProfile.mockReturnValue(new Promise(() => {}));
    listProfileRatings.mockReturnValue(new Promise(() => {}));

    // Act
    renderProfile();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the profile' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading ratings' })).toBeInTheDocument();
  });

  it('shows the person and their ratings, each linking to Post Detail', async () => {
    // Arrange
    getProfile.mockResolvedValue({ user: DANA, friendship: 'NONE' });
    listProfileRatings.mockResolvedValue({ items: [rating(1)], nextCursor: null });

    // Act
    renderProfile();

    // Assert
    expect(await screen.findByRole('heading', { name: 'Dana Levi' })).toBeInTheDocument();
    expect(screen.getByText('Listens on Tidal')).toBeInTheDocument();
    const link = await within(ratingsSection()).findByRole('link');
    expect(link).toHaveAttribute('href', '/posts/post-1');
    expect(link).toHaveTextContent('Song 1');
    expect(link).toHaveTextContent('8/10');
    expect(link).toHaveTextContent(/in Friday Jazz/);
    expect(within(link).getByText(/Still gives me chills/)).toBeInTheDocument();
    expect(listProfileRatings).toHaveBeenCalledWith(DANA.id);
  });

  it('reads "Shared from …" for a pending post', async () => {
    // Arrange
    getProfile.mockResolvedValue({ user: DANA, friendship: 'NONE' });
    listProfileRatings.mockResolvedValue({
      items: [rating(2, { conversionPending: true, title: null, sourceService: 'APPLE_MUSIC' })],
      nextCursor: null,
    });

    // Act
    renderProfile();

    // Assert
    expect(await screen.findByText('Shared from Apple Music')).toBeInTheDocument();
  });

  it('appends the next page with Load more', async () => {
    // Arrange
    getProfile.mockResolvedValue({ user: DANA, friendship: 'NONE' });
    listProfileRatings
      .mockResolvedValueOnce({ items: [rating(1)], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [rating(2)], nextCursor: null });
    renderProfile();
    await screen.findByText('Song 1');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByText('Song 2')).toBeInTheDocument();
    expect(screen.getByText('Song 1')).toBeInTheDocument();
    expect(listProfileRatings).toHaveBeenLastCalledWith(DANA.id, 'cursor-1');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('keeps the loaded rows when Load more fails, and offers Try again', async () => {
    // Arrange
    getProfile.mockResolvedValue({ user: DANA, friendship: 'NONE' });
    listProfileRatings
      .mockResolvedValueOnce({ items: [rating(1)], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(networkError());
    renderProfile();
    await screen.findByText('Song 1');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(RATINGS_LOAD_FAILED);
    expect(screen.getByText('Song 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the empty state with their name', async () => {
    // Arrange
    getProfile.mockResolvedValue({ user: DANA, friendship: 'NONE' });
    listProfileRatings.mockResolvedValue({ items: [], nextCursor: null });

    // Act
    renderProfile();

    // Assert
    expect(await screen.findByText('No ratings to show')).toBeInTheDocument();
    expect(
      screen.getByText("You'll see Dana Levi's ratings from the communities you share."),
    ).toBeInTheDocument();
  });

  it('keeps the header when the ratings fail, and retries them', async () => {
    // Arrange
    getProfile.mockResolvedValue({ user: DANA, friendship: 'NONE' });
    listProfileRatings
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ items: [rating(1)], nextCursor: null });
    renderProfile();
    expect(await screen.findByText(RATINGS_LOAD_FAILED)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dana Levi' })).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('Song 1')).toBeInTheDocument();
  });

  it('shows the not-found page for an unknown user', async () => {
    // Arrange
    getProfile.mockRejectedValue(httpError(404, 'User not found.'));
    listProfileRatings.mockRejectedValue(httpError(404, 'User not found.'));

    // Act
    renderProfile();

    // Assert
    expect(await screen.findByText("This page doesn't exist")).toBeInTheDocument();
  });

  it('shows the profile error with Try again', async () => {
    // Arrange
    getProfile
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ user: DANA, friendship: 'NONE' });
    listProfileRatings.mockResolvedValue({ items: [], nextCursor: null });
    renderProfile();
    await screen.findByText(PROFILE_FAILED);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Dana Levi' })).toBeInTheDocument();
  });

  it('redirects your own id to My Profile', async () => {
    // Arrange
    getProfile.mockReturnValue(new Promise(() => {}));
    listProfileRatings.mockReturnValue(new Promise(() => {}));

    // Act
    renderProfile(VIEWER.id);

    // Assert
    expect(await screen.findByText('My Profile screen')).toBeInTheDocument();
  });
});
