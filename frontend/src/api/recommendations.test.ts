import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import { CONVERSION_REQUEST_TIMEOUT_MS } from './posts';
import {
  countUnseenRecommendations,
  hideRecommendation,
  listReceived,
  listSent,
  markRecommendationsSeen,
  sendRecommendation,
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

  it('hideRecommendation PUTs on the encoded id', async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    await hideRecommendation('a/b');

    // Assert
    expect(seen[0]?.method).toBe('put');
    expect(seen[0]?.url).toBe('/recommendations/a%2Fb/hidden');
  });
});
