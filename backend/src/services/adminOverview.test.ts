import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deploymentsPayload,
  imagesPayload,
  LIVE_SHA,
  OLD_SHA,
  ROLLBACK_SHA,
  usagePayload,
} from '../test/opsFixtures.js';
import {
  buildDeploymentsView,
  buildImagesView,
  buildUsageView,
  getAdminOverview,
  isStale,
  statusFor,
} from './adminOverview.js';

const { db, warn } = vi.hoisted(() => ({
  db: {
    user: { count: vi.fn() },
    community: { count: vi.fn() },
    post: { count: vi.fn() },
    rating: { count: vi.fn() },
    comment: { count: vi.fn() },
    opsSnapshot: { findMany: vi.fn(), findFirst: vi.fn() },
    dailyAppOpens: { findMany: vi.fn(), findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  },
  warn: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const NOW = new Date('2026-11-17T12:00:00.000Z');
const HOUR = 3_600_000;
const GB = 1e9;

function at(hoursAgo: number): Date {
  return new Date(NOW.getTime() - hoursAgo * HOUR);
}

type Row = { id: string; capturedAt: Date; payload: unknown };

/** Serves each source's rows newest first, honouring skip/take like Prisma. */
function snapshots(bySource: Record<string, Row[]>) {
  db.opsSnapshot.findMany.mockImplementation(
    async ({ where, skip = 0, take }: { where: { source: string }; skip?: number; take: number }) =>
      (bySource[where.source] ?? []).slice(skip, skip + take),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(4);
  db.community.count.mockResolvedValue(2);
  db.post.count.mockResolvedValueOnce(7).mockResolvedValueOnce(3);
  db.rating.count.mockResolvedValue(11);
  db.comment.count.mockResolvedValue(6);
  db.dailyAppOpens.findMany.mockResolvedValue([]);
  db.dailyAppOpens.findFirst.mockResolvedValue(null);
  db.$queryRaw.mockResolvedValue([{ size: 40n * 1024n * 1024n }]);
  db.opsSnapshot.findFirst.mockResolvedValue(null);
  snapshots({});
});

/* docs/features/admin-overview.md §8 — unit, services/adminOverview.ts */

describe('statusFor', () => {
  it.each([
    [0, 'ok'],
    [59.9, 'ok'],
    [60, 'watch'],
    [79.9, 'watch'],
    [80, 'stop'],
    [171.6, 'stop'],
  ] as const)('%s%% is %s', (pct, status) => {
    // Act + Assert
    expect(statusFor(pct)).toBe(status);
  });
});

describe('isStale', () => {
  it('is false just under 48 hours and true at 48 hours', () => {
    // Act + Assert
    expect(isStale(new Date(NOW.getTime() - 48 * HOUR + 60_000), NOW)).toBe(false);
    expect(isStale(at(48), NOW)).toBe(true);
  });
});

describe('buildUsageView', () => {
  it('computes each storage meter, its status and its change since the previous reading', () => {
    // Arrange
    const latest = { capturedAt: at(3), payload: usagePayload({ images: 8.5 * GB }) };
    const previous = { capturedAt: at(30), payload: usagePayload({ images: 8.1 * GB }) };

    // Act
    const view = buildUsageView(latest, previous, NOW);

    // Assert
    expect(view.capturedAt).toBe(at(3).toISOString());
    expect(view.stale).toBe(false);
    expect(view.storage.images).toEqual({
      usedBytes: 8.5 * GB,
      limitBytes: 10 * GB,
      pct: 85,
      status: 'stop',
      changeBytes: 0.4 * GB,
    });
    expect(view.storage.functions.changeBytes).toBe(0);
  });

  it('has no change without a previous reading', () => {
    // Act
    const view = buildUsageView({ capturedAt: at(1), payload: usagePayload() }, undefined, NOW);

    // Assert
    expect(view.storage.images.changeBytes).toBeNull();
  });

  it('keeps only other meters at 60% or more, fullest first, and names the fullest overall', () => {
    // Arrange
    const payload = usagePayload({
      others: [
        { name: 'Edge Requests', pct: 61 },
        { name: 'CPU', pct: 12 },
        { name: 'Transfer', pct: 85 },
      ],
    });

    // Act
    const view = buildUsageView({ capturedAt: at(1), payload }, undefined, NOW);

    // Assert
    expect(view.others).toEqual([
      { name: 'Transfer', pct: 85, status: 'stop' },
      { name: 'Edge Requests', pct: 61, status: 'watch' },
    ]);
    expect(view.highestOther).toEqual({ name: 'Transfer', pct: 85 });
  });

  it('has no fullest meter when there are no others', () => {
    // Act
    const view = buildUsageView(
      { capturedAt: at(1), payload: usagePayload({ others: [] }) },
      undefined,
      NOW,
    );

    // Assert
    expect(view.highestOther).toBeNull();
  });
});

describe('buildImagesView and buildDeploymentsView', () => {
  it('marks an image in use by a tag that starts a deployment SHA, and joins its size onto the deployment', () => {
    // Arrange
    const images = { capturedAt: at(2), payload: imagesPayload() };
    const deployments = { capturedAt: at(1), payload: deploymentsPayload() };

    // Act
    const imagesView = buildImagesView(images, deployments.payload, NOW);
    const deploymentsView = buildDeploymentsView(deployments, images.payload.images, NOW);

    // Assert
    expect(imagesView.items.map((image) => image.inUse)).toEqual([true, false]);
    expect(imagesView.totalBytes).toBe(822_000_000);
    expect(deploymentsView.items.map((item) => item.imageSizeBytes)).toEqual([412_000_000, null]);
    expect(deploymentsView.items.every((item) => item.deleted === false)).toBe(true);
  });

  it('does not count a deployment this run deleted as a user of its image', () => {
    // Arrange — OLD_SHA's deployment was deleted; its image is now orphaned.
    const deployments = deploymentsPayload({
      deployments: [
        ...deploymentsPayload().deployments,
        {
          id: 'dpl_old',
          sha: OLD_SHA,
          createdAt: '2026-11-15T09:00:00.000Z',
          state: 'READY',
          target: 'production',
          verdict: 'delete',
        },
      ],
      deleted: [{ id: 'dpl_old', sha: OLD_SHA, createdAt: '2026-11-15T09:00:00.000Z' }],
    });

    // Act
    const view = buildImagesView({ capturedAt: at(1), payload: imagesPayload() }, deployments, NOW);
    const listed = buildDeploymentsView(
      { capturedAt: at(1), payload: deployments },
      undefined,
      NOW,
    );

    // Assert
    expect(view.items[1]).toMatchObject({ digest: 'bbbbbbbbbbbb', inUse: false });
    expect(listed.items.find((item) => item.id === 'dpl_old')?.deleted).toBe(true);
  });

  it('never treats an untagged image, or one with no deployments snapshot, as in use', () => {
    // Arrange
    const payload = imagesPayload({
      images: [{ tags: [], digest: 'eeeeeeeeeeee', sizeBytes: 1, publishedAt: null }],
    });

    // Act
    const withDeployments = buildImagesView(
      { capturedAt: at(1), payload },
      deploymentsPayload(),
      NOW,
    );
    const withoutDeployments = buildImagesView(
      { capturedAt: at(1), payload: imagesPayload() },
      undefined,
      NOW,
    );

    // Assert
    expect(withDeployments.items[0]?.inUse).toBe(false);
    expect(withoutDeployments.items.every((image) => !image.inUse)).toBe(true);
  });

  it('a deployment without a commit gets no image', () => {
    // Arrange
    const payload = deploymentsPayload({
      deployments: [
        {
          id: 'd',
          sha: null,
          createdAt: NOW.toISOString(),
          state: 'READY',
          target: null,
          verdict: 'keep',
        },
      ],
    });

    // Act
    const view = buildDeploymentsView({ capturedAt: at(1), payload }, imagesPayload().images, NOW);

    // Assert
    expect(view.items[0]?.imageSizeBytes).toBeNull();
  });
});

describe('getAdminOverview', () => {
  it('returns the live app figures and the database size against its limit', async () => {
    // Act
    const overview = await getAdminOverview(NOW);

    // Assert
    expect(overview.generatedAt).toBe(NOW.toISOString());
    expect(overview.app).toMatchObject({
      users: { total: 5, onboarded: 4 },
      communities: 2,
      posts: { community: 7, direct: 3 },
      ratings: 11,
      comments: 6,
    });
    expect(overview.database).toEqual({
      usedBytes: 40 * 1024 * 1024,
      limitBytes: 512 * 1024 * 1024,
      pct: 7.8,
      status: 'ok',
    });
    expect(overview.vercel).toEqual({
      usage: null,
      deployments: null,
      images: null,
      lastDeletion: { deployments: null, images: null },
    });
  });

  it('uses the newest snapshot of each source, the one before it for the change, and the latest deletion', async () => {
    // Arrange
    snapshots({
      VERCEL_USAGE: [
        { id: 'u2', capturedAt: at(3), payload: usagePayload({ images: 5 * GB }) },
        { id: 'u1', capturedAt: at(27), payload: usagePayload({ images: 4.5 * GB }) },
      ],
      IMAGE_CLEANUP: [{ id: 'i1', capturedAt: at(50), payload: imagesPayload() }],
      PRUNE_DEPLOYMENTS: [{ id: 'p1', capturedAt: at(5), payload: deploymentsPayload() }],
    });
    db.opsSnapshot.findFirst.mockImplementation(async ({ where }: { where: { source: string } }) =>
      where.source === 'PRUNE_DEPLOYMENTS' ? { capturedAt: at(29), deletedCount: 3 } : null,
    );

    // Act
    const { vercel } = await getAdminOverview(NOW);

    // Assert
    expect(vercel.usage?.storage.images.changeBytes).toBe(0.5 * GB);
    expect(vercel.images?.stale).toBe(true);
    expect(vercel.deployments?.items.map((item) => item.sha)).toEqual([LIVE_SHA, ROLLBACK_SHA]);
    expect(vercel.lastDeletion).toEqual({
      deployments: { at: at(29).toISOString(), count: 3 },
      images: null,
    });
    expect(db.opsSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { source: 'PRUNE_DEPLOYMENTS', deletedCount: { gt: 0 } } }),
    );
  });

  it('skips a stored payload the schema rejects, with a WARN, and uses the next older valid one', async () => {
    // Arrange
    snapshots({
      VERCEL_USAGE: [
        { id: 'bad', capturedAt: at(1), payload: { shape: 'old' } },
        { id: 'good', capturedAt: at(2), payload: usagePayload() },
      ],
    });

    // Act
    const { vercel } = await getAdminOverview(NOW);

    // Assert
    expect(vercel.usage?.capturedAt).toBe(at(2).toISOString());
    expect(warn).toHaveBeenCalledWith(
      { snapshotId: 'bad', source: 'VERCEL_USAGE' },
      expect.any(String),
    );
  });

  it('is null when no stored payload of a source is readable', async () => {
    // Arrange
    snapshots({ IMAGE_CLEANUP: [{ id: 'bad', capturedAt: at(1), payload: null }] });

    // Act
    const { vercel } = await getAdminOverview(NOW);

    // Assert
    expect(vercel.images).toBeNull();
  });
});
