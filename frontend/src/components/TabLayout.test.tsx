import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFriendRequests } from '../stores/friendRequests';
import { TabLayout } from './TabLayout';

const { countFriendRequests } = vi.hoisted(() => ({ countFriendRequests: vi.fn() }));
vi.mock('../api/friends', () => ({ countFriendRequests }));
const { countMyInvitations } = vi.hoisted(() => ({ countMyInvitations: vi.fn() }));
vi.mock('../api/invitations', () => ({ countMyInvitations }));

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
  useFriendRequests.setState({ count: 0 });
  countFriendRequests.mockResolvedValue(0);
  countMyInvitations.mockResolvedValue(0);
});

describe('TabLayout and BottomNav', () => {
  it('shows five tabs and marks the current one', async () => {
    // Act
    renderAt('/home');

    // Assert
    const tabs = ['Home', 'Search', 'Friends', 'My List', 'Profile'].map((name) =>
      within(nav()).getByRole('link', { name }),
    );
    expect(tabs[0]).toHaveAttribute('aria-current', 'page');
    expect(tabs[1]).not.toHaveAttribute('aria-current');
    await waitFor(() => expect(countFriendRequests).toHaveBeenCalled());
  });

  it('switches screens through the tabs, refreshing the badge on each', async () => {
    // Arrange
    renderAt('/home');
    await waitFor(() => expect(countFriendRequests).toHaveBeenCalledTimes(1));

    // Act
    await userEvent.click(within(nav()).getByRole('link', { name: 'Search' }));

    // Assert
    expect(screen.getByRole('heading', { name: 'Search screen' })).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Search' })).toHaveAttribute(
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
});
