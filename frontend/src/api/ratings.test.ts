import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import { ratePost } from './ratings';

function respondWith(data: unknown): InternalAxiosRequestConfig[] {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data, status: 201, statusText: '', headers: new AxiosHeaders(), config };
  };
  api.defaults.adapter = adapter;
  return seen;
}

const POST_ID = '9a3e1d52-7b4c-4f2a-8e61-3c5d7f9b1a20';

afterEach(() => {
  delete api.defaults.adapter;
});

describe('ratings API module', () => {
  it('ratePost posts the score and comment, quietly, and unwraps the rating', async () => {
    // Arrange
    const rating = { id: 'r', score: 7, comment: null, createdAt: '2026-10-05T10:00:00.000Z' };
    const seen = respondWith({ status: 'success', data: { rating } });

    // Act
    const result = await ratePost(POST_ID, { score: 7, comment: null });

    // Assert
    expect(result).toEqual(rating);
    expect(seen[0]).toMatchObject({
      method: 'post',
      url: `/posts/${POST_ID}/ratings`,
      skipErrorToast: true,
    });
    expect(JSON.parse(seen[0]!.data as string)).toEqual({ score: 7, comment: null });
  });
});
