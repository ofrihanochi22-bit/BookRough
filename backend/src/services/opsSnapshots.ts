import type { OpsSource, Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';

/**
 * Snapshots written by the ops tools and read by Admin → Overview
 * (docs/features/admin-overview.md §3.2, §4.2–4.4). Each source has a strict
 * schema: the payload is checked on the way in and again on the way out, so an
 * older shape left in the table can never break the page.
 */

export const OPS_SOURCES = ['VERCEL_USAGE', 'IMAGE_CLEANUP', 'PRUNE_DEPLOYMENTS'] as const;

/** Snapshots older than this (by received_at) are deleted by the next insert. */
export const RETENTION_DAYS = 90;
/** How old a reading may be when it is posted. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Clock skew allowed between the tool and the server. */
const MAX_AHEAD_MS = 5 * 60 * 1000;

const bytes = z.number().finite().nonnegative();
const isoTime = z.string().datetime({ offset: true });
const tag = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const digest = z.string().regex(/^[0-9a-f]{12,64}$/);
const sha = z.string().regex(/^[0-9a-f]{7,40}$/);

const meter = z.object({ usedBytes: bytes, limitBytes: z.number().finite().positive() }).strict();

export const vercelUsagePayload = z
  .object({
    period: z.string().max(80).nullable(),
    storage: z.object({ functions: meter, images: meter, deployment: meter }).strict(),
    others: z
      .array(
        z
          .object({ name: z.string().min(1).max(80), pct: z.number().finite().min(0).max(1000) })
          .strict(),
      )
      .max(60),
  })
  .strict();

const imageRef = z.object({ tags: z.array(tag).max(20), digest, sizeBytes: bytes }).strict();

export const imageCleanupPayload = z
  .object({
    images: z.array(imageRef.extend({ publishedAt: isoTime.nullable() }).strict()).max(200),
    deleted: z.array(imageRef).max(200),
  })
  .strict();

const VERDICTS = ['keep (live)', 'keep (rollback)', 'keep (unfinished)', 'keep', 'delete'] as const;
const deploymentId = z.string().min(1).max(64);

export const pruneDeploymentsPayload = z
  .object({
    dryRun: z.boolean(),
    liveId: deploymentId,
    deployments: z
      .array(
        z
          .object({
            id: deploymentId,
            sha: sha.nullable(),
            createdAt: isoTime,
            state: z.string().min(1).max(20),
            target: z.string().max(20).nullable(),
            verdict: z.enum(VERDICTS),
          })
          .strict(),
      )
      // The newest 200, plus up to 10 deletions past them (pruneDeployments.ts).
      .max(210),
    deleted: z
      .array(z.object({ id: deploymentId, sha: sha.nullable(), createdAt: isoTime }).strict())
      .max(10),
  })
  .strict();

export type VercelUsagePayload = z.infer<typeof vercelUsagePayload>;
export type ImageCleanupPayload = z.infer<typeof imageCleanupPayload>;
export type PruneDeploymentsPayload = z.infer<typeof pruneDeploymentsPayload>;

export const PAYLOAD_SCHEMAS = {
  VERCEL_USAGE: vercelUsagePayload,
  IMAGE_CLEANUP: imageCleanupPayload,
  PRUNE_DEPLOYMENTS: pruneDeploymentsPayload,
} as const satisfies Record<OpsSource, z.ZodTypeAny>;

/** Who is posting: the skills come with an admin session, CI with the ingest token. */
export type SnapshotWriter = { kind: 'admin'; userId: string } | { kind: 'ci' };

/** Each path may write only its own sources, so a leaked CI token can't fake a storage reading. */
const ALLOWED: Record<SnapshotWriter['kind'], readonly OpsSource[]> = {
  admin: ['VERCEL_USAGE', 'IMAGE_CLEANUP'],
  ci: ['PRUNE_DEPLOYMENTS'],
};

export interface SnapshotInput {
  source: string;
  capturedAt: string;
  payload: unknown;
}

function deletedCount(source: OpsSource, payload: unknown): number {
  if (source === 'VERCEL_USAGE') return 0;
  return (payload as { deleted: unknown[] }).deleted.length;
}

/** The posted time, refused when unreadable, more than 7 days old or more than 5 minutes ahead. */
export function parseCapturedAt(value: string, now: Date): Date {
  const parsed = isoTime.safeParse(value);
  const time = parsed.success ? new Date(parsed.data) : null;
  if (
    time === null ||
    Number.isNaN(time.getTime()) ||
    time.getTime() < now.getTime() - MAX_AGE_MS ||
    time.getTime() > now.getTime() + MAX_AHEAD_MS
  ) {
    throw new AppError('capturedAt must be an ISO time within the last 7 days.', 422);
  }
  return time;
}

/**
 * Validates and stores one snapshot, and deletes snapshots older than the
 * retention window in the same transaction.
 */
export async function recordSnapshot(
  input: SnapshotInput,
  writer: SnapshotWriter,
  now: Date = new Date(),
): Promise<{ id: string; capturedAt: Date; source: OpsSource; deletedCount: number }> {
  if (!(OPS_SOURCES as readonly string[]).includes(input.source)) {
    throw new AppError('Unknown snapshot source.', 422);
  }
  const source = input.source as OpsSource;
  if (!ALLOWED[writer.kind].includes(source)) {
    throw new AppError("This snapshot source can't be posted here.", 422);
  }
  const capturedAt = parseCapturedAt(input.capturedAt, now);
  const parsed = PAYLOAD_SCHEMAS[source].safeParse(input.payload);
  if (!parsed.success) {
    throw new AppError('The snapshot payload is invalid.', 422);
  }
  const count = deletedCount(source, parsed.data);
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [, row] = await prisma.$transaction([
    prisma.opsSnapshot.deleteMany({ where: { receivedAt: { lt: cutoff } } }),
    prisma.opsSnapshot.create({
      data: {
        source,
        capturedAt,
        payload: parsed.data as Prisma.InputJsonValue,
        deletedCount: count,
        writtenById: writer.kind === 'admin' ? writer.userId : null,
      },
      select: { id: true, capturedAt: true },
    }),
  ]);
  return { id: row.id, capturedAt: row.capturedAt, source, deletedCount: count };
}
