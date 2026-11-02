import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { claimSavedApiAnswers, clearSavedApiAnswers } from './offlineCache';

const OWNER = 'bookrough.apiCacheOwner';

function stubCaches(deleted = vi.fn().mockResolvedValue(true)) {
  vi.stubGlobal('caches', { delete: deleted });
  return deleted;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clearSavedApiAnswers', () => {
  it('deletes only the api cache', () => {
    // Arrange
    const deleted = stubCaches();

    // Act
    clearSavedApiAnswers();

    // Assert
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(deleted).toHaveBeenCalledWith('api');
  });

  it('does nothing in a browser without Cache Storage', () => {
    // Arrange
    vi.stubGlobal('caches', undefined);

    // Act & Assert
    expect(() => clearSavedApiAnswers()).not.toThrow();
  });

  it('ignores Cache Storage refusing', async () => {
    // Arrange
    const deleted = stubCaches(vi.fn().mockRejectedValue(new Error('private mode')));

    // Act
    clearSavedApiAnswers();

    // Assert
    await expect(deleted.mock.results[0]?.value).rejects.toThrow();
  });
});

describe('claimSavedApiAnswers', () => {
  it('deletes answers collected for someone else, and takes ownership', () => {
    // Arrange
    const deleted = stubCaches();
    window.localStorage.setItem(OWNER, 'user-a');

    // Act
    claimSavedApiAnswers('user-b');

    // Assert
    expect(deleted).toHaveBeenCalledWith('api');
    expect(window.localStorage.getItem(OWNER)).toBe('user-b');
  });

  it('wipes on the first claim, since whatever is saved has no known owner', () => {
    // Arrange
    const deleted = stubCaches();

    // Act
    claimSavedApiAnswers('user-a');

    // Assert
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it('keeps the answers of the same user', () => {
    // Arrange
    const deleted = stubCaches();
    window.localStorage.setItem(OWNER, 'user-a');

    // Act
    claimSavedApiAnswers('user-a');

    // Assert
    expect(deleted).not.toHaveBeenCalled();
  });
});
