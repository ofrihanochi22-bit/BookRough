import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import { getAdminOverview } from '../services/adminOverview.js';
import { recordSnapshot, type SnapshotWriter } from '../services/opsSnapshots.js';
import { createLogger } from '../utils/logger.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';

const log = createLogger('ops');

/**
 * The envelope only; the source rules and each payload's schema are the
 * service's (docs/features/admin-overview.md §4.4), so every message comes
 * from one place.
 */
const snapshotBodySchema = z
  .object({
    source: z.string().max(40),
    capturedAt: z.string().max(40),
    payload: z.unknown(),
  })
  .strict();

async function ingest(writer: SnapshotWriter, body: unknown) {
  const input = parseBody(snapshotBodySchema, body);
  const saved = await recordSnapshot(
    { source: input.source, capturedAt: input.capturedAt, payload: input.payload },
    writer,
  );
  // Never the payload: the source and how much it deleted are enough.
  log.info(
    {
      userId: writer.kind === 'admin' ? writer.userId : undefined,
      writer: writer.kind,
      source: saved.source,
      deletedCount: saved.deletedCount,
    },
    'Ops snapshot stored',
  );
  return { id: saved.id, capturedAt: saved.capturedAt.toISOString() };
}

/** GET /api/admin/overview — behind requireAuth + requireAppAdmin. */
export const overview: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json(success(await getAdminOverview()));
  } catch (error) {
    next(error);
  }
};

/** POST /api/admin/ops/snapshots — the skills, with the admin's session. */
export const adminSnapshot: RequestHandler = async (req, res, next) => {
  try {
    const saved = await ingest({ kind: 'admin', userId: sessionUser(req).id }, req.body);
    res.status(201).json(success(saved));
  } catch (error) {
    next(error);
  }
};

/** POST /api/ops/snapshots — the CI job, behind requireIngestToken. */
export const ciSnapshot: RequestHandler = async (req, res, next) => {
  try {
    const saved = await ingest({ kind: 'ci' }, req.body);
    res.status(201).json(success(saved));
  } catch (error) {
    next(error);
  }
};
