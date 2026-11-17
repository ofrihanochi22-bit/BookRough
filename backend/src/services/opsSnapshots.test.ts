import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deploymentsPayload, imagesPayload, usagePayload } from '../test/opsFixtures.js';
import {
  imageCleanupPayload,
  parseCapturedAt,
  pruneDeploymentsPayload,
  recordSnapshot,
  vercelUsagePayload,
} from './opsSnapshots.js';

const { db } = vi.hoisted(() => {
  const db = {
    opsSnapshot: {
      deleteMany: vi.fn((args: unknown) => ({ op: 'deleteMany', args })),
      create: vi.fn((args: unknown) => ({ op: 'create', args })),
    },
    $transaction: vi.fn(),
  };
  return { db };
});

vi.mock('../db/prisma.js', () => ({ prisma: db }));

const NOW = new Date('2026-11-17T12:00:00.000Z');
const ADMIN = { kind: 'admin', userId: '00000000-0000-4000-8000-000000000001' } as const;
const CI = { kind: 'ci' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async () => [{ count: 0 }, { id: 'snap-1', capturedAt: NOW }]);
});

/* docs/features/admin-overview.md §8 — unit, services/opsSnapshots.ts */

describe('the payload schemas', () => {
  it('accept a valid payload of each source', () => {
    // Act + Assert
    expect(vercelUsagePayload.safeParse(usagePayload()).success).toBe(true);
    expect(imageCleanupPayload.safeParse(imagesPayload()).success).toBe(true);
    expect(pruneDeploymentsPayload.safeParse(deploymentsPayload()).success).toBe(true);
  });

  it.each([
    ['an extra key', { ...usagePayload(), extra: 1 }],
    [
      'a missing storage meter',
      {
        ...usagePayload(),
        storage: {
          functions: usagePayload().storage.functions,
          images: usagePayload().storage.images,
        },
      },
    ],
    [
      'a limit of 0',
      {
        ...usagePayload(),
        storage: { ...usagePayload().storage, images: { usedBytes: 1, limitBytes: 0 } },
      },
    ],
    ['a negative size', usagePayload({ images: -1 })],
    ['a non-finite size', usagePayload({ images: Number.POSITIVE_INFINITY })],
    ['a meter name over 80', usagePayload({ others: [{ name: 'x'.repeat(81), pct: 1 }] })],
    [
      'over 60 other meters',
      usagePayload({ others: Array.from({ length: 61 }, (_, i) => ({ name: `m${i}`, pct: 1 })) }),
    ],
  ])('VERCEL_USAGE rejects %s', (_label, payload) => {
    // Act + Assert
    expect(vercelUsagePayload.safeParse(payload).success).toBe(false);
  });

  it.each([
    [
      'a bad digest',
      imagesPayload({
        images: [{ tags: [], digest: 'sha256:xyz', sizeBytes: 1, publishedAt: null }],
      }),
    ],
    [
      'a bad tag',
      imagesPayload({
        images: [{ tags: ['bad tag!'], digest: 'aaaaaaaaaaaa', sizeBytes: 1, publishedAt: null }],
      }),
    ],
    [
      'over 20 tags',
      imagesPayload({
        images: [
          {
            tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
            digest: 'aaaaaaaaaaaa',
            sizeBytes: 1,
            publishedAt: null,
          },
        ],
      }),
    ],
    [
      'an unreadable publish time',
      imagesPayload({
        images: [{ tags: [], digest: 'aaaaaaaaaaaa', sizeBytes: 1, publishedAt: 'yesterday' }],
      }),
    ],
    [
      'over 200 images',
      imagesPayload({
        images: Array.from({ length: 201 }, () => ({
          tags: [],
          digest: 'aaaaaaaaaaaa',
          sizeBytes: 1,
          publishedAt: null,
        })),
      }),
    ],
  ])('IMAGE_CLEANUP rejects %s', (_label, payload) => {
    // Act + Assert
    expect(imageCleanupPayload.safeParse(payload).success).toBe(false);
  });

  it.each([
    [
      'a bad SHA',
      deploymentsPayload({
        deployments: [
          {
            id: 'd',
            sha: 'not-a-sha',
            createdAt: NOW.toISOString(),
            state: 'READY',
            target: null,
            verdict: 'keep',
          },
        ],
      }),
    ],
    [
      'an unknown verdict',
      deploymentsPayload({
        deployments: [
          {
            id: 'd',
            sha: null,
            createdAt: NOW.toISOString(),
            state: 'READY',
            target: null,
            verdict: 'nuke' as 'keep',
          },
        ],
      }),
    ],
    [
      'a state over 20',
      deploymentsPayload({
        deployments: [
          {
            id: 'd',
            sha: null,
            createdAt: NOW.toISOString(),
            state: 'X'.repeat(21),
            target: null,
            verdict: 'keep',
          },
        ],
      }),
    ],
    [
      'over 10 deletions',
      deploymentsPayload({
        deleted: Array.from({ length: 11 }, (_, i) => ({
          id: `d${i}`,
          sha: null,
          createdAt: NOW.toISOString(),
        })),
      }),
    ],
  ])('PRUNE_DEPLOYMENTS rejects %s', (_label, payload) => {
    // Act + Assert
    expect(pruneDeploymentsPayload.safeParse(payload).success).toBe(false);
  });
});

describe('parseCapturedAt', () => {
  it('accepts a time inside the window, with a little clock skew', () => {
    // Act + Assert
    expect(parseCapturedAt('2026-11-11T12:00:01.000Z', NOW)).toEqual(
      new Date('2026-11-11T12:00:01.000Z'),
    );
    expect(parseCapturedAt('2026-11-17T12:04:00+00:00', NOW)).toEqual(
      new Date('2026-11-17T12:04:00.000Z'),
    );
  });

  it.each([
    ['unreadable', 'yesterday'],
    ['over 7 days old', '2026-11-10T11:59:00.000Z'],
    ['over 5 minutes ahead', '2026-11-17T12:06:00.000Z'],
  ])('refuses a time that is %s with 422', (_label, value) => {
    // Act + Assert
    expect(() => parseCapturedAt(value, NOW)).toThrow(expect.objectContaining({ statusCode: 422 }));
  });
});

describe('recordSnapshot', () => {
  it('stores an admin reading with its writer and deletes rows past 90 days in the same transaction', async () => {
    // Act
    const saved = await recordSnapshot(
      { source: 'VERCEL_USAGE', capturedAt: '2026-11-17T11:00:00.000Z', payload: usagePayload() },
      ADMIN,
      NOW,
    );

    // Assert
    expect(saved).toEqual({
      id: 'snap-1',
      capturedAt: NOW,
      source: 'VERCEL_USAGE',
      deletedCount: 0,
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.opsSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { receivedAt: { lt: new Date('2026-08-19T12:00:00.000Z') } },
    });
    expect(db.opsSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'VERCEL_USAGE',
          deletedCount: 0,
          writtenById: ADMIN.userId,
        }),
      }),
    );
  });

  it('counts the deletions of an image run', async () => {
    // Arrange
    const payload = imagesPayload({
      deleted: [
        { tags: ['abc1234abcde'], digest: 'cccccccccccc', sizeBytes: 1 },
        { tags: [], digest: 'dddddddddddd', sizeBytes: 1 },
      ],
    });

    // Act
    const saved = await recordSnapshot(
      { source: 'IMAGE_CLEANUP', capturedAt: NOW.toISOString(), payload },
      ADMIN,
      NOW,
    );

    // Assert
    expect(saved.deletedCount).toBe(2);
  });

  it('stores a CI run with no writer', async () => {
    // Act
    await recordSnapshot(
      {
        source: 'PRUNE_DEPLOYMENTS',
        capturedAt: NOW.toISOString(),
        payload: deploymentsPayload({
          deleted: [{ id: 'dpl_old', sha: null, createdAt: NOW.toISOString() }],
        }),
      },
      CI,
      NOW,
    );

    // Assert
    expect(db.opsSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ writtenById: null, deletedCount: 1 }),
      }),
    );
  });

  it.each([
    [
      'an unknown source',
      { source: 'NOPE', capturedAt: NOW.toISOString(), payload: {} },
      ADMIN,
      'Unknown snapshot source.',
    ],
    [
      'PRUNE_DEPLOYMENTS from a session',
      { source: 'PRUNE_DEPLOYMENTS', capturedAt: NOW.toISOString(), payload: deploymentsPayload() },
      ADMIN,
      "This snapshot source can't be posted here.",
    ],
    [
      'VERCEL_USAGE with the token',
      { source: 'VERCEL_USAGE', capturedAt: NOW.toISOString(), payload: usagePayload() },
      CI,
      "This snapshot source can't be posted here.",
    ],
    [
      'IMAGE_CLEANUP with the token',
      { source: 'IMAGE_CLEANUP', capturedAt: NOW.toISOString(), payload: imagesPayload() },
      CI,
      "This snapshot source can't be posted here.",
    ],
    [
      'a payload that breaks its schema',
      { source: 'VERCEL_USAGE', capturedAt: NOW.toISOString(), payload: { period: null } },
      ADMIN,
      'The snapshot payload is invalid.',
    ],
    [
      'a bad capturedAt',
      { source: 'VERCEL_USAGE', capturedAt: 'soon', payload: usagePayload() },
      ADMIN,
      'capturedAt must be an ISO time within the last 7 days.',
    ],
  ] as const)('refuses %s with 422 and writes nothing', async (_label, input, writer, message) => {
    // Act + Assert
    await expect(recordSnapshot(input, writer, NOW)).rejects.toMatchObject({
      statusCode: 422,
      message,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
