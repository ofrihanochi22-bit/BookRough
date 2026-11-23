import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type BackfillDeps,
  backfillBandcampIds,
  readBandcampItemId,
} from './backfillBandcampIds.js';

/* docs/features/in-app-player.md §3 (Backfill), §7. */

const { fetchLinkMetadata } = vi.hoisted(() => ({ fetchLinkMetadata: vi.fn() }));
vi.mock('../services/linkMetadata.service.js', () => ({
  fetchLinkMetadata,
  REQUEST_TIMEOUT_MS: 4_000,
}));

afterEach(() => {
  fetchLinkMetadata.mockReset();
});

type Run = BackfillDeps & { lines: string[]; save: ReturnType<typeof vi.fn> };

function deps(overrides: Partial<BackfillDeps>): Run {
  const lines: string[] = [];
  return {
    findPending: () => Promise.resolve([]),
    readItemId: () => Promise.resolve({ outcome: 'no id' }),
    write: (line: string) => {
      lines.push(line);
    },
    lines,
    ...overrides,
    save: vi.fn(overrides.save ?? (() => Promise.resolve())),
  };
}

describe('backfillBandcampIds', () => {
  it('writes each id found and reports every post by id and outcome', async () => {
    // Arrange
    const run = deps({
      findPending: () =>
        Promise.resolve([
          { id: 'post-1', originalUrl: 'https://a.bandcamp.com/album/one' },
          { id: 'post-2', originalUrl: 'https://a.bandcamp.com/album/two' },
          { id: 'post-3', originalUrl: 'https://a.bandcamp.com/album/three' },
        ]),
      readItemId: (url) => {
        if (url.endsWith('one')) {
          return Promise.resolve({ outcome: 'found', itemId: '11' });
        }
        return Promise.resolve({ outcome: url.endsWith('two') ? 'gone' : 'no id' });
      },
    });

    // Act
    const summary = await backfillBandcampIds(run);

    // Assert
    expect(summary).toEqual({ checked: 3, found: 1, failed: 0 });
    expect(run.save).toHaveBeenCalledTimes(1);
    expect(run.save).toHaveBeenCalledWith('post-1', '11');
    expect(run.lines).toEqual([
      'post-1 found\n',
      'post-2 gone\n',
      'post-3 no id\n',
      'Checked 3, found 1, failed 0.\n',
    ]);
  });

  it('carries on after a post that fails, and counts it', async () => {
    // Arrange
    const run = deps({
      findPending: () =>
        Promise.resolve([
          { id: 'post-1', originalUrl: 'https://a.bandcamp.com/album/one' },
          { id: 'post-2', originalUrl: 'https://a.bandcamp.com/album/two' },
        ]),
      readItemId: () => Promise.resolve({ outcome: 'found', itemId: '7' }),
      save: (postId) =>
        postId === 'post-1' ? Promise.reject(new Error('deleted meanwhile')) : Promise.resolve(),
    });

    // Act
    const summary = await backfillBandcampIds(run);

    // Assert
    expect(summary).toEqual({ checked: 2, found: 1, failed: 1 });
    expect(run.lines).toEqual([
      'post-1 failed\n',
      'post-2 found\n',
      'Checked 2, found 1, failed 1.\n',
    ]);
  });

  it('does nothing when every post already has its id', async () => {
    // Arrange
    const run = deps({});

    // Act
    const summary = await backfillBandcampIds(run);

    // Assert
    expect(summary).toEqual({ checked: 0, found: 0, failed: 0 });
    expect(run.save).not.toHaveBeenCalled();
  });
});

describe('readBandcampItemId', () => {
  const FOUND = { outcome: 'found', title: 'x', artist: null, coverArtUrl: null };

  it.each([
    ['an id', { ...FOUND, itemId: '42' }, { outcome: 'found', itemId: '42' }],
    ['a page without one', { ...FOUND, itemId: null }, { outcome: 'no id' }],
    ['a page that is gone', { outcome: 'gone' }, { outcome: 'gone' }],
    ['an unreadable page', { outcome: 'missing' }, { outcome: 'unreadable' }],
  ])('reports %s', async (_case, metadata, expected) => {
    // Arrange
    fetchLinkMetadata.mockResolvedValue(metadata);

    // Act
    const result = await readBandcampItemId('https://a.bandcamp.com/album/x');

    // Assert
    expect(result).toEqual(expected);
    expect(fetchLinkMetadata).toHaveBeenCalledWith(
      'BANDCAMP',
      'https://a.bandcamp.com/album/x',
      expect.any(Number),
    );
  });
});
