import type { OpsSource } from '@prisma/client';
import type { z } from 'zod';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { createLogger } from '../utils/logger.js';
import { summariseOpens, type OpensSummary } from './appOpens.js';
import {
  imageCleanupPayload,
  pruneDeploymentsPayload,
  vercelUsagePayload,
  type ImageCleanupPayload,
  type PruneDeploymentsPayload,
  type VercelUsagePayload,
} from './opsSnapshots.js';

/**
 * Admin → Overview (docs/features/admin-overview.md §4.1): live figures from
 * Postgres plus the latest snapshot of each ops tool, in one answer. Every
 * field is built here by hand; no row is passed through, and nothing names a
 * user.
 */

const log = createLogger('adminOverview');

export type Status = 'ok' | 'watch' | 'stop';

/** The same thresholds as /vercel-usage: under 60% ok, under 80% watch, else stop. */
export function statusFor(pct: number): Status {
  if (pct >= 80) return 'stop';
  if (pct >= 60) return 'watch';
  return 'ok';
}

export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function isStale(capturedAt: Date, now: Date): boolean {
  return now.getTime() - capturedAt.getTime() >= STALE_AFTER_MS;
}

function percent(used: number, limit: number): number {
  return Math.round((used / limit) * 1000) / 10;
}

const STORAGE_KEYS = ['functions', 'images', 'deployment'] as const;
type StorageKey = (typeof STORAGE_KEYS)[number];

export interface StorageMeterView {
  usedBytes: number;
  limitBytes: number;
  pct: number;
  status: Status;
  changeBytes: number | null;
}

export interface UsageView {
  capturedAt: string;
  stale: boolean;
  period: string | null;
  storage: Record<StorageKey, StorageMeterView>;
  others: { name: string; pct: number; status: Status }[];
  highestOther: { name: string; pct: number } | null;
}

export interface ImageView {
  tags: string[];
  digest: string;
  sizeBytes: number;
  publishedAt: string | null;
  inUse: boolean;
}

export interface ImagesView {
  capturedAt: string;
  stale: boolean;
  items: ImageView[];
  totalBytes: number;
}

export interface DeploymentView {
  id: string;
  sha: string | null;
  createdAt: string;
  state: string;
  verdict: PruneDeploymentsPayload['deployments'][number]['verdict'];
  /** Vercel confirmed this run deleted it (listed in the payload's `deleted`). */
  deleted: boolean;
  imageSizeBytes: number | null;
}

export interface DeploymentsView {
  capturedAt: string;
  stale: boolean;
  dryRun: boolean;
  liveId: string;
  items: DeploymentView[];
}

export interface DeletionView {
  at: string;
  count: number;
}

export interface AdminOverview {
  generatedAt: string;
  app: {
    users: { total: number; onboarded: number };
    communities: number;
    posts: { community: number; direct: number };
    ratings: number;
    comments: number;
    opens: OpensSummary;
  };
  database: { usedBytes: number; limitBytes: number; pct: number; status: Status };
  vercel: {
    usage: UsageView | null;
    deployments: DeploymentsView | null;
    images: ImagesView | null;
    lastDeletion: { deployments: DeletionView | null; images: DeletionView | null };
  };
}

interface Valid<T> {
  capturedAt: Date;
  payload: T;
}

/** How many recent rows to try, at most, before giving up on finding a readable one. */
const SCAN = 20;

/**
 * The newest snapshots of a source whose payload the current schema accepts,
 * newest first, at most `want`. A row the schema rejects (an older shape) is
 * skipped with a WARN, never fatal.
 */
async function latestValid<T>(
  source: OpsSource,
  schema: z.ZodType<T>,
  want: number,
): Promise<Valid<T>[]> {
  // Normally the newest `want` rows are readable: read just those, and look
  // further back only when one is not.
  const valid: Valid<T>[] = [];
  let skip = 0;
  let take = want;
  while (valid.length < want && skip < SCAN) {
    const rows = await prisma.opsSnapshot.findMany({
      where: { source },
      orderBy: [{ capturedAt: 'desc' }, { receivedAt: 'desc' }],
      skip,
      take,
      select: { id: true, capturedAt: true, payload: true },
    });
    for (const row of rows) {
      const parsed = schema.safeParse(row.payload);
      if (!parsed.success) {
        log.warn(
          { snapshotId: row.id, source },
          'Skipped an ops snapshot the current schema rejects',
        );
        continue;
      }
      valid.push({ capturedAt: row.capturedAt, payload: parsed.data });
      if (valid.length >= want) break;
    }
    if (rows.length < take) break;
    skip += take;
    take = SCAN - skip;
  }
  return valid;
}

export function buildUsageView(
  latest: Valid<VercelUsagePayload>,
  previous: Valid<VercelUsagePayload> | undefined,
  now: Date,
): UsageView {
  const storage = {} as Record<StorageKey, StorageMeterView>;
  for (const key of STORAGE_KEYS) {
    const { usedBytes, limitBytes } = latest.payload.storage[key];
    const pct = percent(usedBytes, limitBytes);
    storage[key] = {
      usedBytes,
      limitBytes,
      pct,
      status: statusFor(pct),
      changeBytes: previous ? usedBytes - previous.payload.storage[key].usedBytes : null,
    };
  }
  const byPct = [...latest.payload.others].sort((a, b) => b.pct - a.pct);
  return {
    capturedAt: latest.capturedAt.toISOString(),
    stale: isStale(latest.capturedAt, now),
    period: latest.payload.period,
    storage,
    others: byPct
      .filter((meter) => meter.pct >= 60)
      .map((meter) => ({ name: meter.name, pct: meter.pct, status: statusFor(meter.pct) })),
    highestOther: byPct[0] ? { name: byPct[0].name, pct: byPct[0].pct } : null,
  };
}

/** An image is in use when one of its tags starts a deployment's commit SHA. */
function imageFor(
  sha: string | null,
  images: ImageCleanupPayload['images'],
): ImageCleanupPayload['images'][number] | undefined {
  if (sha === null) return undefined;
  return images.find((image) => image.tags.some((tag) => tag.length >= 7 && sha.startsWith(tag)));
}

/** The commits of deployments that still exist: the run's confirmed deletions are gone. */
function remainingShas(deployments: PruneDeploymentsPayload | undefined): (string | null)[] {
  if (!deployments) return [];
  const gone = new Set(deployments.deleted.map((deployment) => deployment.id));
  return deployments.deployments
    .filter((deployment) => !gone.has(deployment.id))
    .map((deployment) => deployment.sha);
}

export function buildImagesView(
  latest: Valid<ImageCleanupPayload>,
  deployments: PruneDeploymentsPayload | undefined,
  now: Date,
): ImagesView {
  const shas = remainingShas(deployments);
  const items = latest.payload.images.map((image) => ({
    tags: image.tags,
    digest: image.digest,
    sizeBytes: image.sizeBytes,
    publishedAt: image.publishedAt,
    inUse: shas.some((sha) => imageFor(sha, [image]) !== undefined),
  }));
  return {
    capturedAt: latest.capturedAt.toISOString(),
    stale: isStale(latest.capturedAt, now),
    items,
    totalBytes: items.reduce((total, image) => total + image.sizeBytes, 0),
  };
}

export function buildDeploymentsView(
  latest: Valid<PruneDeploymentsPayload>,
  images: ImageCleanupPayload['images'] | undefined,
  now: Date,
): DeploymentsView {
  const gone = new Set(latest.payload.deleted.map((deployment) => deployment.id));
  return {
    capturedAt: latest.capturedAt.toISOString(),
    stale: isStale(latest.capturedAt, now),
    dryRun: latest.payload.dryRun,
    liveId: latest.payload.liveId,
    items: latest.payload.deployments.map((deployment) => ({
      id: deployment.id,
      sha: deployment.sha,
      createdAt: deployment.createdAt,
      state: deployment.state,
      verdict: deployment.verdict,
      deleted: gone.has(deployment.id),
      imageSizeBytes: imageFor(deployment.sha, images ?? [])?.sizeBytes ?? null,
    })),
  };
}

async function lastDeletion(source: OpsSource): Promise<DeletionView | null> {
  const row = await prisma.opsSnapshot.findFirst({
    where: { source, deletedCount: { gt: 0 } },
    orderBy: [{ capturedAt: 'desc' }, { receivedAt: 'desc' }],
    select: { capturedAt: true, deletedCount: true },
  });
  return row ? { at: row.capturedAt.toISOString(), count: row.deletedCount } : null;
}

/**
 * The database's own size. Raw SQL, deliberately (CLAUDE.md §4): Prisma has no
 * way to ask Postgres for it. It is an approximation of what the host bills —
 * write-ahead log and history kept by the host are not visible from inside.
 */
async function databaseSize(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ size: bigint }[]>`
    SELECT pg_database_size(current_database())::bigint AS size`;
  return Number(row?.size ?? 0);
}

export async function getAdminOverview(now: Date = new Date()): Promise<AdminOverview> {
  const [
    users,
    onboarded,
    communities,
    communityPosts,
    directPosts,
    ratings,
    comments,
    opens,
    usedBytes,
    usage,
    images,
    deployments,
    deletedDeployments,
    deletedImages,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { displayName: { not: null }, preferredService: { not: null } } }),
    prisma.community.count(),
    prisma.post.count({ where: { communityId: { not: null } } }),
    prisma.post.count({ where: { recipientId: { not: null } } }),
    prisma.rating.count(),
    prisma.comment.count({ where: { deletedAt: null } }),
    summariseOpens(now),
    databaseSize(),
    latestValid('VERCEL_USAGE', vercelUsagePayload, 2),
    latestValid('IMAGE_CLEANUP', imageCleanupPayload, 1),
    latestValid('PRUNE_DEPLOYMENTS', pruneDeploymentsPayload, 1),
    lastDeletion('PRUNE_DEPLOYMENTS'),
    lastDeletion('IMAGE_CLEANUP'),
  ]);

  const limitBytes = env.DB_STORAGE_LIMIT_MB * 1024 * 1024;
  const dbPct = percent(usedBytes, limitBytes);
  const [latestUsage, previousUsage] = usage;
  const [latestImages] = images;
  const [latestDeployments] = deployments;

  return {
    generatedAt: now.toISOString(),
    app: {
      users: { total: users, onboarded },
      communities,
      posts: { community: communityPosts, direct: directPosts },
      ratings,
      comments,
      opens,
    },
    database: { usedBytes, limitBytes, pct: dbPct, status: statusFor(dbPct) },
    vercel: {
      usage: latestUsage ? buildUsageView(latestUsage, previousUsage, now) : null,
      deployments: latestDeployments
        ? buildDeploymentsView(latestDeployments, latestImages?.payload.images, now)
        : null,
      images: latestImages ? buildImagesView(latestImages, latestDeployments?.payload, now) : null,
      lastDeletion: { deployments: deletedDeployments, images: deletedImages },
    },
  };
}
