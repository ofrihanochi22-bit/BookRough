import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications';

/** Records the request and answers 200 with the given body. */
function respondWith(data: unknown): InternalAxiosRequestConfig[] {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data, status: 200, statusText: '', headers: new AxiosHeaders(), config };
  };
  api.defaults.adapter = adapter;
  return seen;
}

afterEach(() => {
  delete api.defaults.adapter;
});

describe('notifications API module', () => {
  it('listNotifications reads the first page, then pages with before, quietly', async () => {
    // Arrange
    const page = { items: [], nextCursor: null };
    const seen = respondWith({ status: 'success', data: page });

    // Act
    const first = await listNotifications();
    await listNotifications('c1');

    // Assert
    expect(first).toEqual(page);
    expect(seen[0]?.url).toBe('/notifications');
    expect(seen[0]?.params).toBeUndefined();
    expect(seen[1]?.params).toEqual({ before: 'c1' });
    expect(seen[0]?.skipErrorToast).toBe(true);
  });

  it('countUnreadNotifications unwraps the count', async () => {
    // Arrange
    const seen = respondWith({ status: 'success', data: { count: 4 } });

    // Act
    const count = await countUnreadNotifications();

    // Assert
    expect(count).toBe(4);
    expect(seen[0]?.url).toBe('/notifications/unread-count');
  });

  it('markNotificationRead posts to the encoded id', async () => {
    // Arrange
    const seen = respondWith({ status: 'success', data: { notification: {} } });

    // Act
    await markNotificationRead('a/b');

    // Assert
    expect(seen[0]?.method).toBe('post');
    expect(seen[0]?.url).toBe('/notifications/a%2Fb/read');
    expect(seen[0]?.skipErrorToast).toBe(true);
  });

  it('markAllNotificationsRead posts to read-all', async () => {
    // Arrange
    const seen = respondWith({ status: 'success', data: { count: 0 } });

    // Act
    await markAllNotificationsRead();

    // Assert
    expect(seen[0]?.method).toBe('post');
    expect(seen[0]?.url).toBe('/notifications/read-all');
  });
});
