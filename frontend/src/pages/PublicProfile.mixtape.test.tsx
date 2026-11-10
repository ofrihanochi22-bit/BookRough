import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileData, ProfileRating } from '../api/profiles';
import { PROFILE_FAILED, RATINGS_LOAD_FAILED } from '../lib/profileCopy';
import { useAuthStore } from '../stores/auth';
import { makeSession, networkError, resetAuthStore, setDesign, setOnline } from '../test/fixtures';
import { PublicProfile } from './PublicProfile';

const { getProfile, listProfileRatings } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listProfileRatings: vi.fn(),
}));
vi.mock('../api/profiles', () => ({ getProfile, listProfileRatings }));
vi.mock('../api/friends', () => ({
  sendFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  ignoreFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  listFriends: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const DANA_ID = 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function profile(friendship: ProfileData['friendship']): ProfileData {
  return {
    user: {
      id: DANA_ID,
      displayName: 'Dana Levi',
      profilePictureUrl: null,
      preferredService: 'TIDAL',
    },
    friendship,
  };
}

function rating(overrides: Partial<ProfileRating['post']> = {}): ProfileRating {
  return {
    id: 'rating-1',
    score: 8,
    comment: 'A classic.',
    createdAt: '2026-10-06T10:00:00.000Z',
    community: { id: 'community-1', name: 'Friday Jazz' },
    post: {
      id: 'post-1',
      sourceService: 'SPOTIFY',
      platform: null,
      kind: 'TRACK',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      coverArtUrl: null,
      conversionPending: false,
      ...overrides,
    },
  };
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={[`/users/${DANA_ID}`]}>
      <Routes>
        <Route path="/users/:userId" element={<PublicProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

const actionButtons = () =>
  screen.getAllByRole('button').filter((button) => button.className.includes('flex-1'));

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
  getProfile.mockResolvedValue(profile('FRIENDS'));
  listProfileRatings.mockResolvedValue({ items: [rating()], nextCursor: null });
});

afterEach(() => {
  cleanup();
  resetAuthStore();
  setDesign('current');
});

describe('Public Profile under Mixtape (ui-redesign.md §5.6)', () => {
  it('puts the person on a tape card with the stripe band, name as h1 and service', async () => {
    // Act
    renderProfile();

    // Assert
    const card = await screen.findByTestId('profile-tape');
    expect(within(card).getByTestId('cover-stripe')).toBeInTheDocument();
    expect(within(card).getByRole('heading', { level: 1, name: 'Dana Levi' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Listens on Tidal');
    expect(screen.getByText('BookRough')).toBeInTheDocument();
  });

  it('shows ✓ Friends as the secondary and Send a song as the primary, half width each', async () => {
    // Act
    renderProfile();

    // Assert
    const friends = await screen.findByRole('button', { name: '✓ Friends' });
    const send = screen.getByRole('button', { name: 'Send a song' });
    expect(actionButtons()).toEqual([friends, send]);
    expect(friends.className).toContain('border-line');
    expect(send.className).toContain('bg-accent');
  });

  it('gives a single Add Friend button the full row, as a secondary pill', async () => {
    // Arrange
    getProfile.mockResolvedValue(profile('NONE'));

    // Act
    renderProfile();

    // Assert
    const add = await screen.findByRole('button', { name: 'Add Friend' });
    expect(actionButtons()).toEqual([add]);
    expect(add.className).toContain('border-line');
    expect(screen.queryByRole('button', { name: 'Send a song' })).not.toBeInTheDocument();
  });

  it('shows each rating as a card with a score sticker, linking to Post Detail', async () => {
    // Act
    renderProfile();

    // Assert
    const row = await screen.findByRole('link', { name: /Bohemian Rhapsody/ });
    expect(row).toHaveAttribute('href', '/posts/post-1');
    expect(within(row).getByRole('img', { name: '8/10' })).toHaveTextContent('8');
    expect(row).toHaveTextContent('in Friday Jazz');
    expect(row).not.toHaveTextContent('8/10');
  });

  it('shows the empty ratings state as an h3 under the Ratings h2', async () => {
    // Arrange
    listProfileRatings.mockResolvedValue({ items: [], nextCursor: null });

    // Act
    renderProfile();

    // Assert
    expect(
      await screen.findByRole('heading', { level: 3, name: 'No ratings to show' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Ratings' })).toBeInTheDocument();
  });

  it('shows skeletons while the profile loads', () => {
    // Arrange
    getProfile.mockReturnValue(new Promise(() => {}));

    // Act
    renderProfile();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading the profile' })).toBeInTheDocument();
  });

  it('shows the profile and ratings load errors', async () => {
    // Arrange
    listProfileRatings.mockRejectedValue(networkError());

    // Act
    renderProfile();

    // Assert
    expect(await screen.findByText(RATINGS_LOAD_FAILED)).toBeInTheDocument();
    expect(screen.getByTestId('profile-tape')).toBeInTheDocument();
  });

  it('shows the profile load error without the tape card', async () => {
    // Arrange
    getProfile.mockRejectedValue(networkError());

    // Act
    renderProfile();

    // Assert
    expect(await screen.findByText(PROFILE_FAILED)).toBeInTheDocument();
    expect(screen.queryByTestId('profile-tape')).not.toBeInTheDocument();
  });

  it('dashes and disables both actions offline', async () => {
    // Arrange
    setOnline(false);

    // Act
    renderProfile();

    // Assert
    const friends = await screen.findByRole('button', { name: '✓ Friends' });
    expect(friends).toBeDisabled();
    expect(friends.className).toContain('border-dashed');
    expect(screen.getByRole('button', { name: 'Send a song' }).className).toContain(
      'border-dashed',
    );
  });
});
