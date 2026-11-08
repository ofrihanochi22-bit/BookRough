import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicNotification } from '../api/notifications';
import { useNotifications } from '../stores/notifications';
import { setOnline } from '../test/fixtures';
import { Notifications } from './Notifications';

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/notifications', () => ({
  listNotifications: api.listNotifications,
  markNotificationRead: api.markNotificationRead,
  markAllNotificationsRead: api.markAllNotificationsRead,
}));
vi.mock('react-hot-toast', () => ({ default: { error: api.toastError } }));

const DANA = { id: 'dana', displayName: 'Dana', profilePictureUrl: null };

function note(overrides: Partial<PublicNotification> = {}): PublicNotification {
  return {
    id: 'n1',
    type: 'FRIEND_REQUEST',
    at: new Date().toISOString(),
    read: false,
    actor: DANA,
    community: null,
    post: null,
    count: 1,
    score: null,
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Routes>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/home" element={<p>Home screen</p>} />
        <Route path="/communities/:id" element={<p>Community screen</p>} />
        <Route path="/recommendations" element={<p>Recommendations screen</p>} />
        <Route path="/posts/:postId" element={<p>Post screen</p>} />
        <Route path="/friends" element={<p>Friends screen</p>} />
        <Route path="/users/:userId" element={<p>Profile screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const markAll = () => screen.getByRole('button', { name: 'Mark all as read' });

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useNotifications.setState({ unread: 0 });
  api.markNotificationRead.mockResolvedValue(undefined);
  api.markAllNotificationsRead.mockResolvedValue(undefined);
});

describe('Notifications — states', () => {
  it('shows skeleton rows while loading', () => {
    // Arrange
    api.listNotifications.mockReturnValue(new Promise(() => {}));

    // Act
    renderScreen();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument();
  });

  it('shows the empty state, with no Mark all as read', async () => {
    // Arrange
    api.listNotifications.mockResolvedValue({ items: [], nextCursor: null });

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('shows the error with Try again, which loads again', async () => {
    // Arrange
    api.listNotifications
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ items: [note()], nextCursor: null });
    renderScreen();

    // Act
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your notifications.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText(/sent you a friend request/)).toBeInTheDocument();
  });
});

describe('Notifications — rows', () => {
  it.each([
    [
      note({
        type: 'COMMUNITY_POSTS',
        count: 3,
        community: { id: 'jazz', name: 'Friday Jazz' },
      }),
      '3 new posts in Friday Jazz · latest from Dana',
      'Community screen',
    ],
    [
      note({ type: 'COMMUNITY_POSTS', community: { id: 'jazz', name: 'Friday Jazz' } }),
      'Dana posted in Friday Jazz',
      'Community screen',
    ],
    [
      note({ type: 'RECOMMENDATION', post: { id: 'p1', title: 'Blue' } }),
      'Dana sent you Blue',
      'Recommendations screen',
    ],
    [
      note({ type: 'RATING', post: { id: 'p1', title: 'Blue' }, score: 8 }),
      'Dana rated Blue 8/10',
      'Post screen',
    ],
    [note({ type: 'FRIEND_REQUEST' }), 'Dana sent you a friend request', 'Friends screen'],
    [note({ type: 'FRIEND_ACCEPTED' }), 'Dana accepted your friend request', 'Profile screen'],
    [
      note({ type: 'COMMUNITY_INVITATION', community: { id: 'jazz', name: 'Friday Jazz' } }),
      'Dana invited you to Friday Jazz',
      'Friends screen',
    ],
  ])('%#: says "%s" and opens its screen', async (item, text, destination) => {
    // Arrange
    api.listNotifications.mockResolvedValue({ items: [item], nextCursor: null });
    renderScreen();

    // Act
    const row = await screen.findByRole('link', { name: new RegExp(text) });
    await userEvent.click(row);

    // Assert
    expect(screen.getByText(destination)).toBeInTheDocument();
  });

  it('falls back when a title or score is missing', async () => {
    // Arrange
    api.listNotifications.mockResolvedValue({
      items: [
        note({ id: 'a', type: 'RECOMMENDATION', post: { id: 'p1', title: null } }),
        note({ id: 'b', type: 'RATING', post: { id: 'p2', title: null }, score: null }),
      ],
      nextCursor: null,
    });

    // Act
    renderScreen();

    // Assert
    expect(await screen.findByText(/sent you a song/)).toBeInTheDocument();
    expect(screen.getByText(/rated your post$/)).toBeInTheDocument();
  });

  it('marks an unread row read when tapped, and lowers the badge', async () => {
    // Arrange
    useNotifications.setState({ unread: 2 });
    api.listNotifications.mockResolvedValue({ items: [note()], nextCursor: null });
    renderScreen();

    // Act
    await userEvent.click(await screen.findByRole('link', { name: /sent you a friend request/ }));

    // Assert
    expect(api.markNotificationRead).toHaveBeenCalledWith('n1');
    expect(useNotifications.getState().unread).toBe(1);
    expect(screen.getByText('Friends screen')).toBeInTheDocument();
  });

  it('still opens it when marking read fails', async () => {
    // Arrange
    api.markNotificationRead.mockRejectedValue(new Error('down'));
    api.listNotifications.mockResolvedValue({ items: [note()], nextCursor: null });
    renderScreen();

    // Act
    await userEvent.click(await screen.findByRole('link', { name: /sent you a friend request/ }));

    // Assert
    expect(screen.getByText('Friends screen')).toBeInTheDocument();
  });

  it('does not mark a read row again, nor anything while offline', async () => {
    // Arrange
    api.listNotifications.mockResolvedValue({
      items: [note({ read: true })],
      nextCursor: null,
    });
    renderScreen();

    // Act
    await userEvent.click(await screen.findByRole('link', { name: /sent you a friend request/ }));

    // Assert
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it('shows an unread dot only on unread rows', async () => {
    // Arrange
    api.listNotifications.mockResolvedValue({
      items: [note({ id: 'a' }), note({ id: 'b', type: 'FRIEND_ACCEPTED', read: true })],
      nextCursor: null,
    });

    // Act
    renderScreen();

    // Assert
    const unreadRow = await screen.findByRole('link', { name: /sent you a friend request/ });
    expect(within(unreadRow).getByText('Unread')).toBeInTheDocument();
    const readRow = screen.getByRole('link', { name: /accepted/ });
    expect(within(readRow).queryByText('Unread')).not.toBeInTheDocument();
  });
});

describe('Notifications — Mark all as read and paging', () => {
  it('marks everything read and clears the badge', async () => {
    // Arrange
    useNotifications.setState({ unread: 2 });
    api.listNotifications.mockResolvedValue({
      items: [note({ id: 'a' }), note({ id: 'b', type: 'FRIEND_ACCEPTED' })],
      nextCursor: null,
    });
    renderScreen();
    await screen.findByRole('link', { name: /sent you a friend request/ });

    // Act
    await userEvent.click(markAll());

    // Assert
    expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
    expect(useNotifications.getState().unread).toBe(0);
    expect(markAll()).toBeDisabled();
  });

  it('toasts and keeps the rows unread when it fails', async () => {
    // Arrange
    api.markAllNotificationsRead.mockRejectedValue(new Error('down'));
    api.listNotifications.mockResolvedValue({ items: [note()], nextCursor: null });
    renderScreen();
    await screen.findByRole('link', { name: /sent you a friend request/ });

    // Act
    await userEvent.click(markAll());

    // Assert
    expect(api.toastError).toHaveBeenCalledWith("Couldn't mark them as read. Try again.");
    expect(screen.getByText('Unread')).toBeInTheDocument();
  });

  it('is disabled when nothing is unread', async () => {
    // Arrange
    api.listNotifications.mockResolvedValue({ items: [note({ read: true })], nextCursor: null });

    // Act
    renderScreen();

    // Assert
    await screen.findByRole('link', { name: /sent you a friend request/ });
    expect(markAll()).toBeDisabled();
  });

  it('is disabled offline, with a note, and tapping a row marks nothing', async () => {
    // Arrange
    setOnline(false);
    api.listNotifications.mockResolvedValue({ items: [note()], nextCursor: null });
    renderScreen();

    // Act
    const row = await screen.findByRole('link', { name: /sent you a friend request/ });

    // Assert
    expect(markAll()).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(
      "You're offline. Connect to mark them as read.",
    );
    await userEvent.click(row);
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it('loads more with the cursor, and offers Try again when that fails', async () => {
    // Arrange
    api.listNotifications
      .mockResolvedValueOnce({ items: [note({ id: 'a' })], nextCursor: 'c1' })
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        items: [note({ id: 'b', type: 'FRIEND_ACCEPTED' })],
        nextCursor: null,
      });
    renderScreen();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    // Assert
    expect(await screen.findByText("Couldn't load more notifications.")).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('link', { name: /accepted/ })).toBeInTheDocument();
    expect(api.listNotifications).toHaveBeenLastCalledWith('c1');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('goes back Home', async () => {
    // Arrange
    api.listNotifications.mockResolvedValue({ items: [], nextCursor: null });
    renderScreen();

    // Act
    await screen.findByText('No notifications yet');
    await userEvent.click(screen.getByRole('link', { name: /Home/ }));

    // Assert
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });
});
