import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicNotification } from '../api/notifications';
import { NOTIFICATIONS_LOAD_FAILED } from '../lib/notificationCopy';
import { useNotifications } from '../stores/notifications';
import { networkError, setOnline } from '../test/fixtures';
import { Notifications } from './Notifications';

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock('../api/notifications', () => api);
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

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
        <Route path="/friends" element={<p>Friends screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const rows = () => within(screen.getByRole('list')).getAllByRole('link');

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useNotifications.setState({ unread: 1, readOne: vi.fn(), setUnread: vi.fn() });
  api.markNotificationRead.mockResolvedValue(undefined);
  api.markAllNotificationsRead.mockResolvedValue(undefined);
  api.listNotifications.mockResolvedValue({
    items: [note({ id: 'unread' }), note({ id: 'read', read: true })],
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('Notifications (ui-redesign.md §5.8)', () => {
  it('has the Home back link beside the logo and Mark all as read beside the heading', async () => {
    // Act
    renderScreen();

    // Assert
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/home');
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1, name: 'Notifications' });
    expect(heading.parentElement).toContainElement(
      await screen.findByRole('button', { name: 'Mark all as read' }),
    );
  });

  it('marks unread rows (raised card, dot, sr-only Unread) and leaves read rows flat', async () => {
    // Act
    renderScreen();

    // Assert
    await screen.findByRole('list');
    const [unread, read] = rows();
    expect(within(unread!).getByText('Unread')).toHaveClass('sr-only');
    expect(unread!.className).toContain('bg-surface');
    expect(read).not.toHaveTextContent('Unread');
    expect(read!.className).not.toContain('bg-surface');
    expect(read!.className).toContain('text-muted');
  });

  it('reads a row when tapped and opens it', async () => {
    // Arrange
    renderScreen();
    await screen.findByRole('list');

    // Act
    await userEvent.click(rows()[0]!);

    // Assert
    expect(api.markNotificationRead).toHaveBeenCalledWith('unread');
    expect(screen.getByText('Friends screen')).toBeInTheDocument();
  });

  it('Mark all as read reads every row', async () => {
    // Arrange
    renderScreen();

    // Act
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    // Assert
    expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });

  it('shows the empty state in the kit treatment', async () => {
    // Arrange
    useNotifications.setState({ unread: 0 });
    api.listNotifications.mockResolvedValue({ items: [], nextCursor: null });

    // Act
    renderScreen();

    // Assert
    expect(
      await screen.findByRole('heading', { level: 2, name: 'No notifications yet' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('shows skeletons, then the load error', async () => {
    // Arrange
    api.listNotifications.mockRejectedValue(networkError());

    // Act
    renderScreen();

    // Assert
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument();
    expect(await screen.findByText(NOTIFICATIONS_LOAD_FAILED)).toBeInTheDocument();
  });
});
