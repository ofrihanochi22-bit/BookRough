import { describe, expect, it } from 'vitest';

import type { SavedPost } from '../api/bookmarks';
import { makePendingPost, makePost } from '../test/fixtures';
import { canRetrySaved } from './savedPosts';

function saved(overrides: Partial<SavedPost>): SavedPost {
  return {
    savedAt: '2026-11-18T10:00:00.000Z',
    community: { id: 'c1', name: 'Friday Jazz' },
    isMember: true,
    post: makePendingPost({ id: 'post-1' }),
    ...overrides,
  };
}

describe('canRetrySaved', () => {
  it('offers a retry on a pending community post while a member', () => {
    // Arrange
    const item = saved({});

    // Act
    const result = canRetrySaved(item);

    // Assert
    expect(result).toBe(true);
  });

  it('offers a retry on a pending direct recommendation', () => {
    // Arrange
    const item = saved({ community: null, isMember: false });

    // Act
    const result = canRetrySaved(item);

    // Assert
    expect(result).toBe(true);
  });

  it('offers none after leaving the community, where the server answers 404', () => {
    // Arrange
    const item = saved({ isMember: false });

    // Act
    const result = canRetrySaved(item);

    // Assert
    expect(result).toBe(false);
  });

  it('offers none on a converted post', () => {
    // Arrange
    const item = saved({ post: makePost({ id: 'post-1' }) });

    // Act
    const result = canRetrySaved(item);

    // Assert
    expect(result).toBe(false);
  });
});
