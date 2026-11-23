import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makePost } from '../test/fixtures';

import { api } from './client';
import { CONVERSION_REQUEST_TIMEOUT_MS } from './posts';
import {
  checkInBackground,
  countUnchecked,
  countUnseenRecommendations,
  archiveRecommendation,
  countArchived,
  listArchived,
  unarchiveRecommendation,
  listReceived,
  listSent,
  listUnchecked,
  markChecked,
  markRecommendationsSeen,
  sendRecommendation,
  unmarkChecked,
} from './recommendations';

function respondWith(data: unknown): InternalAxiosRequestConfig[] {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data, status: 200, statusText: '', headers: new AxiosHeaders(), config };
  };
  api.defaults.adapter = adapter;
  return seen;
}

const ok = (data: unknown) => ({ status: 'success', data });
const PAGE = { posts: [], nextCursor: null };

afterEach(() => {
  delete api.defaults.adapter;
});

describe('recommendations API module', () => {
  it('sendRecommendation POSTs the recipient and link, waiting for the conversion', async () => {
    // Arrange
    const seen = respondWith(ok({ post: { id: 'p1' } }));

    // Act
    const post = await sendRecommendation('friend-1', { url: 'https://x', comment: null });

    // Assert
    expect(post).toEqual({ id: 'p1' });
    expect(seen[0]?.url).toBe('/recommendations');
    expect(JSON.parse(seen[0]?.data as string)).toEqual({
      recipientId: 'friend-1',
      url: 'https://x',
      comment: null,
    });
    expect(seen[0]?.timeout).toBe(CONVERSION_REQUEST_TIMEOUT_MS);
    expect(seen[0]?.skipErrorToast).toBe(true);
  });

  it.each([
    ['listReceived', listReceived, '/recommendations/received'],
    ['listSent', listSent, '/recommendations/sent'],
  ])('%s GETs its list, with the cursor when given', async (_name, list, url) => {
    // Arrange
    const seen = respondWith(ok(PAGE));

    // Act
    const first = await list();
    await list('cursor-1');

    // Assert
    expect(first).toEqual(PAGE);
    expect(seen[0]?.url).toBe(url);
    expect(seen[0]?.params).toBeUndefined();
    expect(seen[1]?.params).toEqual({ before: 'cursor-1' });
  });

  it('countUnseenRecommendations returns the count', async () => {
    // Arrange
    respondWith(ok({ count: 3 }));

    // Act & Assert
    await expect(countUnseenRecommendations()).resolves.toBe(3);
  });

  it('markRecommendationsSeen POSTs', async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    await markRecommendationsSeen();

    // Assert
    expect(seen[0]?.method).toBe('post');
    expect(seen[0]?.url).toBe('/recommendations/seen');
  });

  it('archiveRecommendation PUTs and unarchiveRecommendation DELETEs on the encoded id', async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    await archiveRecommendation('a/b');
    await unarchiveRecommendation('a/b');

    // Assert
    expect(seen.map((call) => [call.method, call.url])).toEqual([
      ['put', '/recommendations/a%2Fb/archived'],
      ['delete', '/recommendations/a%2Fb/archived'],
    ]);
  });

  it('listArchived sends the cursor only when there is one; countArchived unwraps the count', async () => {
    // Arrange
    const seen = respondWith(ok({ posts: [], nextCursor: null }));

    // Act
    await listArchived();
    await listArchived('c1');

    // Assert
    expect(seen[0]?.url).toBe('/recommendations/archived');
    expect(seen[0]?.params).toBeUndefined();
    expect(seen[1]?.params).toEqual({ before: 'c1' });

    // Arrange
    respondWith(ok({ count: 3 }));

    // Act & Assert
    expect(await countArchived()).toBe(3);
  });
});

describe('From communities API (community-unchecked.md §4)', () => {
  it('listUnchecked sends the cursor only when there is one, and unwraps the page', async () => {
    // Arrange
    const page = { items: [], nextCursor: null };
    const seen = respondWith(ok(page));

    // Act
    const first = await listUnchecked();
    await listUnchecked('abc');

    // Assert
    expect(first).toEqual(page);
    expect(seen[0]?.url).toBe('/recommendations/community');
    expect(seen[0]?.params).toBeUndefined();
    expect(seen[1]?.params).toEqual({ before: 'abc' });
    expect(seen[0]?.skipErrorToast).toBe(true);
  });

  it('countUnchecked unwraps the count', async () => {
    // Arrange
    respondWith(ok({ count: 4 }));

    // Act & Assert
    await expect(countUnchecked()).resolves.toBe(4);
  });

  it('markChecked PUTs and unmarkChecked DELETEs on the encoded id, quietly', async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    await markChecked('a/b');
    await unmarkChecked('a/b');

    // Assert
    expect(seen[0]).toMatchObject({
      method: 'put',
      url: '/recommendations/community/a%2Fb/checked',
      skipErrorToast: true,
    });
    expect(seen[1]).toMatchObject({
      method: 'delete',
      url: '/recommendations/community/a%2Fb/checked',
      skipErrorToast: true,
    });
  });

  it("checkInBackground checks only someone else's community post", async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    checkInBackground(makePost({ id: 'community' }));
    checkInBackground(makePost({ id: 'mine', isMine: true }));
    checkInBackground(
      makePost({
        id: 'direct',
        direct: {
          recipient: { id: 'n', displayName: 'Noam', profilePictureUrl: null },
          isFriend: true,
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Assert
    expect(seen.map((config) => config.url)).toEqual([
      '/recommendations/community/community/checked',
    ]);
  });

  it('checkInBackground swallows a failure', async () => {
    // Arrange
    api.defaults.adapter = () => Promise.reject(new Error('offline'));

    // Act & Assert: no unhandled rejection reaches the test.
    expect(() => checkInBackground(makePost())).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
