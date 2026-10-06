import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makePost } from '../test/fixtures';
import { api } from './client';
import { createPost, deletePost, getPost, listPosts, retryConversion } from './posts';

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
const ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';

afterEach(() => {
  delete api.defaults.adapter;
});

describe('posts API module', () => {
  it('createPost posts the link and comment, quietly, and unwraps the post', async () => {
    // Arrange
    const post = makePost();
    const seen = respondWith(ok({ post }));

    // Act
    const result = await createPost(ID, { url: post.originalUrl, comment: null });

    // Assert
    expect(result).toEqual(post);
    expect(seen[0]).toMatchObject({
      method: 'post',
      url: `/communities/${ID}/posts`,
      skipErrorToast: true,
    });
    expect(JSON.parse(seen[0]!.data as string)).toEqual({ url: post.originalUrl, comment: null });
  });

  it('listPosts sends the cursor only when there is one', async () => {
    // Arrange
    const page = { posts: [makePost()], nextCursor: 'abc' };
    const seen = respondWith(ok(page));

    // Act
    const first = await listPosts(ID);
    await listPosts(ID, 'abc');

    // Assert
    expect(first).toEqual(page);
    expect(seen[0]).toMatchObject({ url: `/communities/${ID}/posts`, skipErrorToast: true });
    expect(seen[0]!.params).toBeUndefined();
    expect(seen[1]!.params).toEqual({ before: 'abc' });
  });

  it('retryConversion posts to the post and unwraps it', async () => {
    // Arrange
    const post = makePost();
    const seen = respondWith(ok({ post }));

    // Act
    const result = await retryConversion(post.id);

    // Assert
    expect(result).toEqual(post);
    expect(seen[0]).toMatchObject({ method: 'post', url: `/posts/${post.id}/conversion` });
  });

  it('deletePost sends a quiet DELETE to the post', async () => {
    // Arrange
    const seen = respondWith(ok(null));

    // Act
    await deletePost('post-1');

    // Assert
    expect(seen[0]).toMatchObject({
      method: 'delete',
      url: '/posts/post-1',
      skipErrorToast: true,
    });
  });

  it('getPost reads one post with its community, quietly', async () => {
    // Arrange
    const data = { post: makePost(), community: { id: ID, name: 'Friday Jazz' } };
    const seen = respondWith(ok(data));

    // Act
    const result = await getPost(data.post.id);

    // Assert
    expect(result).toEqual(data);
    expect(seen[0]).toMatchObject({ url: `/posts/${data.post.id}`, skipErrorToast: true });
  });
});
