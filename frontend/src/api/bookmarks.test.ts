import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makePost } from '../test/fixtures';
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks';
import { api } from './client';

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
const POST_ID = '9a3e1d52-7b4c-4f2a-8e61-3c5d7f9b1a20';

afterEach(() => {
  delete api.defaults.adapter;
});

describe('bookmarks API module', () => {
  it('saveBookmark PUTs to the post, quietly', async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    await saveBookmark(POST_ID);

    // Assert
    expect(seen[0]).toMatchObject({
      method: 'put',
      url: `/posts/${POST_ID}/bookmark`,
      skipErrorToast: true,
    });
  });

  it('removeBookmark DELETEs it, quietly', async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    await removeBookmark(POST_ID);

    // Assert
    expect(seen[0]).toMatchObject({
      method: 'delete',
      url: `/posts/${POST_ID}/bookmark`,
      skipErrorToast: true,
    });
  });

  it('listBookmarks sends the cursor only when there is one, and unwraps the page', async () => {
    // Arrange
    const page = {
      items: [
        {
          savedAt: '2026-10-05T10:00:00.000Z',
          community: { id: 'c', name: 'Friday Jazz' },
          isMember: true,
          post: makePost({ isBookmarked: true }),
        },
      ],
      nextCursor: 'abc',
    };
    const seen = respondWith(ok(page));

    // Act
    const first = await listBookmarks();
    await listBookmarks('abc');

    // Assert
    expect(first).toEqual(page);
    expect(seen[0]).toMatchObject({ url: '/users/me/bookmarks', skipErrorToast: true });
    expect(seen[0]!.params).toBeUndefined();
    expect(seen[1]!.params).toEqual({ before: 'abc' });
  });
});
