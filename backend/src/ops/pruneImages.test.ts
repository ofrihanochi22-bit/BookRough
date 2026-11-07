import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Config,
  deleteImage,
  listImages,
  planPrune,
  readConfig,
  type RegistryImage,
} from './pruneImages.js';

/* docs/features/production-hardening.md §3.8: every guard of the registry prune. */
const SHA = 'f78a80f0123456789abcdef0123456789abcdef0';
const OPTIONS = { keep: 4, currentSha: SHA, maxDeletes: 10 };

function image(day: number, tags: string[] = [`commit${day}`]): RegistryImage {
  return {
    id: `image_${day}`,
    createdAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    tags,
  };
}

const ids = (images: RegistryImage[]) => images.map((entry) => entry.id);

describe('planPrune', () => {
  it('keeps the 4 newest of 7 tagged images and removes the 3 oldest', () => {
    // Arrange — deliberately out of order
    const images = [3, 7, 1, 5, 2, 6, 4].map((day) => image(day));

    // Act
    const plan = planPrune(images, OPTIONS);

    // Assert
    expect(ids(plan.keep)).toEqual(['image_7', 'image_6', 'image_5', 'image_4']);
    expect(ids(plan.remove)).toEqual(['image_3', 'image_2', 'image_1']);
  });

  it.each([0, 1, 4])('deletes nothing when there are %i tagged images', (count) => {
    // Arrange
    const images = Array.from({ length: count }, (_, index) => image(index + 1));

    // Act & Assert
    expect(planPrune(images, OPTIONS).remove).toEqual([]);
  });

  it('never plans an untagged entry, which can belong to a kept image', () => {
    // Arrange
    const images = [...[1, 2, 3, 4, 5].map((day) => image(day)), image(0, []), image(6, [])];

    // Act
    const plan = planPrune(images, OPTIONS);

    // Assert
    expect(plan.untagged).toBe(2);
    expect(ids(plan.remove)).toEqual(['image_1']);
  });

  it.each([SHA, SHA.slice(0, 7)])(
    "keeps the current commit's image even when it is old (tag %s)",
    (tag) => {
      // Arrange
      const images = [image(1, [tag]), ...[2, 3, 4, 5, 6].map((day) => image(day))];

      // Act
      const plan = planPrune(images, OPTIONS);

      // Assert
      expect(ids(plan.remove)).toEqual(['image_2']);
      expect(ids(plan.keep)).toContain('image_1');
    },
  );

  it('does not treat a short tag that merely starts the SHA as the commit', () => {
    // Arrange — "f78" is too short to name a commit
    const images = [image(1, ['f78']), ...[2, 3, 4, 5].map((day) => image(day))];

    // Act & Assert
    expect(ids(planPrune(images, OPTIONS).remove)).toEqual(['image_1']);
  });

  it('throws, deleting nothing, on an unreadable createdAt', () => {
    // Arrange
    const images = [
      ...[1, 2, 3, 4, 5].map((day) => image(day)),
      { ...image(6), createdAt: 'soon' },
    ];

    // Act & Assert
    expect(() => planPrune(images, OPTIONS)).toThrowError(/unreadable createdAt; deleting nothing/);
  });

  it('refuses to delete more than the per-run limit', () => {
    // Arrange — 15 tagged images would mean 11 deletions
    const images = Array.from({ length: 15 }, (_, index) => image(index + 1));

    // Act & Assert
    expect(() => planPrune(images, OPTIONS)).toThrowError(/Refusing to delete 11 images/);
  });
});

describe('readConfig', () => {
  const base = { VERCEL_TOKEN: 't', VERCEL_TEAM: 'team', CURRENT_SHA: SHA };

  it('defaults the project and repository, and is a dry run unless PRUNE_IMAGES is "delete"', () => {
    // Act
    const dry = readConfig(base);
    const deleting = readConfig({ ...base, PRUNE_IMAGES: 'delete' });

    // Assert
    expect(dry).toMatchObject({ project: 'bookrough', repository: 'api', deleting: false });
    expect(deleting.deleting).toBe(true);
    expect(readConfig({ ...base, PRUNE_IMAGES: 'yes' }).deleting).toBe(false);
  });

  it.each(['VERCEL_TOKEN', 'VERCEL_TEAM', 'CURRENT_SHA'])('fails when %s is missing', (name) => {
    // Act & Assert
    expect(() => readConfig({ ...base, [name]: ' ' })).toThrowError(`${name} is not set.`);
  });
});

describe('the registry calls', () => {
  const config: Config = {
    token: 'secret-token',
    team: 'team',
    project: 'bookrough',
    repository: 'api',
    currentSha: SHA,
    deleting: true,
  };
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (status: number, body?: unknown) =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));

  it('follows the cursor across pages and sends the token only as a bearer header', async () => {
    // Arrange
    fetchMock
      .mockReturnValueOnce(answer(200, { images: [image(1)], nextCursor: 'next' }))
      .mockReturnValueOnce(answer(200, { images: [image(2)] }));

    // Act
    const images = await listImages(config);

    // Assert
    expect(ids(images)).toEqual(['image_1', 'image_2']);
    const [firstUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain('/v1/vcr/repository/api/images?');
    expect(firstUrl).toContain('projectId=bookrough');
    expect(firstUrl).not.toContain('secret-token');
    expect(init.headers).toEqual({ Authorization: 'Bearer secret-token' });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('cursor=next');
  });

  it('fails, deleting nothing, when the listing is refused', async () => {
    // Arrange
    fetchMock.mockReturnValue(answer(403, {}));

    // Act & Assert
    await expect(listImages(config)).rejects.toThrowError(/HTTP 403; deleting nothing/);
  });

  it.each([
    ['no image array', { items: [] }],
    ['an image without tags', { images: [{ id: 'x', createdAt: '2026-11-01' }] }],
  ])('fails on %s', async (_label, body) => {
    // Arrange
    fetchMock.mockReturnValue(answer(200, body));

    // Act & Assert
    await expect(listImages(config)).rejects.toThrowError(/unexpected shape; deleting nothing/);
  });

  it('gives up after too many pages', async () => {
    // Arrange
    fetchMock.mockImplementation(() => answer(200, { images: [], nextCursor: 'again' }));

    // Act & Assert
    await expect(listImages(config)).rejects.toThrowError(/More than 20 pages/);
  });

  it.each([202, 404, 410])('treats a DELETE answered %i as done', async (status) => {
    // Arrange
    fetchMock.mockReturnValue(answer(status));

    // Act
    await deleteImage(config, image(1));

    // Assert
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/vcr/repository/api/images/image_1?');
    expect(init.method).toBe('DELETE');
  });

  it('fails on any other DELETE answer', async () => {
    // Arrange
    fetchMock.mockReturnValue(answer(500));

    // Act & Assert
    await expect(deleteImage(config, image(1))).rejects.toThrowError(
      /image_1 failed with HTTP 500/,
    );
  });
});
