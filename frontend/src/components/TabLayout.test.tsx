import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { useFriendRequests } from '../stores/friendRequests';
import { makeSession, resetAuthStore } from '../test/fixtures';
import { useNotifications } from '../stores/notifications';
import { TabLayout } from './TabLayout';

const { countFriendRequests } = vi.hoisted(() => ({ countFriendRequests: vi.fn() }));
vi.mock('../api/friends', () => ({ countFriendRequests }));
const { countMyInvitations } = vi.hoisted(() => ({ countMyInvitations: vi.fn() }));
vi.mock('../api/invitations', () => ({ countMyInvitations }));
const { countUnseenRecommendations } = vi.hoisted(() => ({
  countUnseenRecommendations: vi.fn(),
}));
vi.mock('../api/recommendations', () => ({ countUnseenRecommendations }));
const { countUnreadNotifications } = vi.hoisted(() => ({ countUnreadNotifications: vi.fn() }));
vi.mock('../api/notifications', () => ({ countUnreadNotifications }));
const { listMyCommunities } = vi.hoisted(() => ({ listMyCommunities: vi.fn() }));
vi.mock('../api/communities', () => ({ listMyCommunities }));
const { markTutorialSeen } = vi.hoisted(() => ({ markTutorialSeen: vi.fn() }));
vi.mock('../api/users', () => ({ markTutorialSeen }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/home" element={<h1>Home screen</h1>} />
          <Route path="/search" element={<h1>Search screen</h1>} />
          <Route path="/friends" element={<h1>Friends screen</h1>} />
          <Route path="/my-list" element={<h1>My List screen</h1>} />
          <Route path="/profile" element={<h1>Profile screen</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const nav = () => screen.getByRole('navigation', { name: 'Main' });

beforeEach(() => {
  vi.resetAllMocks();
  useFriendRequests.setState({ count: 0, unseen: 0 });
  useNotifications.setState({ unread: 0 });
  countFriendRequests.mockResolvedValue(0);
  countMyInvitations.mockResolvedValue(0);
  countUnseenRecommendations.mockResolvedValue(0);
  countUnreadNotifications.mockResolvedValue(0);
});

describe('TabLayout and BottomNav', () => {
  it('switches screens through the tabs, refreshing the badge on each', async () => {
    // Arrange
    renderAt('/home');
    await waitFor(() => expect(countFriendRequests).toHaveBeenCalledTimes(1));

    // Act
    await userEvent.click(within(nav()).getByRole('link', { name: 'My List' }));

    // Assert
    expect(screen.getByRole('heading', { name: 'My List screen' })).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'My List' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await waitFor(() => expect(countFriendRequests).toHaveBeenCalledTimes(2));
  });

  it('badges the Friends tab with the pending count, named for screen readers', async () => {
    // Arrange
    countFriendRequests.mockResolvedValue(2);

    // Act
    renderAt('/home');

    // Assert
    const friends = await within(nav()).findByRole('link', { name: 'Friends, 2 waiting' });
    expect(within(friends).getByText('2')).toBeInTheDocument();
  });

  it('says "9+" above nine, and names one waiting item', async () => {
    // Arrange
    countFriendRequests.mockResolvedValueOnce(12);
    const { unmount } = renderAt('/home');

    // Assert
    const many = await within(nav()).findByRole('link', { name: 'Friends, 12 waiting' });
    expect(within(many).getByText('9+')).toBeInTheDocument();
    unmount();

    // Act
    countFriendRequests.mockResolvedValueOnce(1);
    renderAt('/home');

    // Assert
    expect(
      await within(nav()).findByRole('link', { name: 'Friends, 1 waiting' }),
    ).toBeInTheDocument();
  });

  it('counts friend requests plus community invitations (invite-friends.md §5.5)', async () => {
    // Arrange
    countFriendRequests.mockResolvedValue(1);
    countMyInvitations.mockResolvedValue(2);

    // Act
    renderAt('/home');

    // Assert
    expect(
      await within(nav()).findByRole('link', { name: 'Friends, 3 waiting' }),
    ).toBeInTheDocument();
  });

  it('shows no badge at zero, or when the count cannot be fetched', async () => {
    // Arrange
    countFriendRequests.mockRejectedValue(new Error('offline'));

    // Act
    renderAt('/home');
    await waitFor(() => expect(countFriendRequests).toHaveBeenCalled());

    // Assert
    const friends = within(nav()).getByRole('link', { name: 'Friends' });
    expect(within(friends).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it('the Friends badge no longer adds unseen recommendations (notifications.md §5.3)', async () => {
    // Arrange
    countFriendRequests.mockResolvedValue(1);
    countMyInvitations.mockResolvedValue(1);
    countUnseenRecommendations.mockResolvedValue(2);

    // Act
    renderAt('/home');

    // Assert
    expect(
      await within(nav()).findByRole('link', { name: 'Friends, 2 waiting' }),
    ).toBeInTheDocument();
    expect(useFriendRequests.getState().unseen).toBe(2);
  });

  it('badges the Home tab with unread notifications, refreshed on each navigation', async () => {
    // Arrange
    countUnreadNotifications.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    renderAt('/home');

    // Assert
    const home = await within(nav()).findByRole('link', { name: 'Home, 3 unread' });
    expect(within(home).getByText('3')).toBeInTheDocument();

    // Act
    await userEvent.click(within(nav()).getByRole('link', { name: 'My List' }));

    // Assert
    expect(await within(nav()).findByRole('link', { name: 'Home, 1 unread' })).toBeInTheDocument();
  });

  it('keeps the last Home count when the fetch fails, and shows none at zero', async () => {
    // Arrange
    countUnreadNotifications.mockRejectedValue(new Error('offline'));

    // Act
    renderAt('/home');
    await waitFor(() => expect(countUnreadNotifications).toHaveBeenCalled());

    // Assert
    const home = within(nav()).getByRole('link', { name: 'Home' });
    expect(within(home).queryByText(/\d/)).not.toBeInTheDocument();
  });
});

describe('BottomNav (ui-redesign.md §3.4)', () => {
  it('reads Home, Friends, Share, My List, Profile, with no Search tab', async () => {
    // Act
    renderAt('/home');

    // Assert
    const items = within(nav()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Home',
      'Friends',
      'Share',
      'My List',
      'Profile',
    ]);
    expect(within(nav()).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Search' })).not.toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await waitFor(() => expect(countFriendRequests).toHaveBeenCalled());
  });

  it('keeps the Home and Friends badges and their accessible names', async () => {
    // Arrange
    countUnreadNotifications.mockResolvedValue(3);
    countFriendRequests.mockResolvedValue(2);

    // Act
    renderAt('/friends');

    // Assert
    const home = await within(nav()).findByRole('link', { name: 'Home, 3 unread' });
    expect(within(home).getByText('3')).toBeInTheDocument();
    const friends = await within(nav()).findByRole('link', { name: 'Friends, 2 waiting' });
    expect(friends).toHaveAttribute('aria-current', 'page');
  });

  it('opens the Share sheet from the central button, and closes it', async () => {
    // Arrange
    renderAt('/home');

    // Act
    await userEvent.click(within(nav()).getByRole('button', { name: 'Share' }));

    // Assert
    const sheet = screen.getByRole('dialog', { name: 'Share a song' });
    expect(within(sheet).getByRole('button', { name: /To a community/ })).toBeInTheDocument();

    // Act
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('TabLayout — the walkthrough (onboarding-tutorial.md §5.1)', () => {
  afterEach(() => {
    resetAuthStore();
  });

  it('covers the tab screen while the session says so; Skip removes it', async () => {
    // Arrange
    markTutorialSeen.mockResolvedValue({});
    useAuthStore
      .getState()
      .setSession(makeSession({ tutorial: { walkthrough: true, saveTip: true, listTip: true } }));

    // Act
    renderAt('/home');

    // Assert
    expect(screen.getByRole('dialog', { name: 'How BookRough works' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(markTutorialSeen).toHaveBeenCalledWith('walkthrough');
  });

  it('stays away once seen', () => {
    // Arrange
    useAuthStore
      .getState()
      .setSession(makeSession({ tutorial: { walkthrough: false, saveTip: true, listTip: true } }));

    // Act
    renderAt('/home');

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
