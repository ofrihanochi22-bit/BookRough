/**
 * Fills `posts.bandcamp_item_id` for Bandcamp posts published before the
 * in-app player (docs/features/in-app-player.md §3). Run by hand:
 *
 *   cd backend && npm run backfill:bandcamp
 *
 * against the database in `DATABASE_URL`. Production's is a secret, so the
 * developer runs it there (CLAUDE.md §11). It fetches each page through the
 * metadata fetcher's limits, one at a time, writes only that column, and is
 * safe to run again. Its output names post ids and outcomes only — never a
 * title or an author.
 */

import { pathToFileURL } from 'node:url';

import { fetchLinkMetadata, REQUEST_TIMEOUT_MS } from '../services/linkMetadata.service.js';

export interface PendingPost {
  id: string;
  originalUrl: string;
}

export type BackfillOutcome = 'found' | 'no id' | 'gone' | 'unreadable';

export interface BackfillDeps {
  /** Bandcamp posts whose id is still null. */
  findPending: () => Promise<PendingPost[]>;
  /** The page's item id, or why there is none. Must not throw. */
  readItemId: (url: string) => Promise<{ outcome: BackfillOutcome; itemId?: string }>;
  save: (postId: string, itemId: string) => Promise<void>;
  write: (line: string) => void;
}

export interface BackfillSummary {
  checked: number;
  found: number;
  failed: number;
}

/** One post at a time; a failure is reported and the run carries on. */
export async function backfillBandcampIds(deps: BackfillDeps): Promise<BackfillSummary> {
  const pending = await deps.findPending();
  const summary: BackfillSummary = { checked: pending.length, found: 0, failed: 0 };
  for (const post of pending) {
    let outcome: string;
    try {
      const result = await deps.readItemId(post.originalUrl);
      if (result.outcome === 'found' && result.itemId) {
        await deps.save(post.id, result.itemId);
        summary.found += 1;
      }
      outcome = result.outcome;
    } catch {
      summary.failed += 1;
      outcome = 'failed';
    }
    deps.write(`${post.id} ${outcome}\n`);
  }
  deps.write(`Checked ${summary.checked}, found ${summary.found}, failed ${summary.failed}.\n`);
  return summary;
}

/** The metadata fetcher, reduced to the id. */
export async function readBandcampItemId(
  url: string,
): Promise<{ outcome: BackfillOutcome; itemId?: string }> {
  const result = await fetchLinkMetadata('BANDCAMP', url, Date.now() + REQUEST_TIMEOUT_MS);
  if (result.outcome === 'gone') {
    return { outcome: 'gone' };
  }
  if (result.outcome === 'missing') {
    return { outcome: 'unreadable' };
  }
  return result.itemId ? { outcome: 'found', itemId: result.itemId } : { outcome: 'no id' };
}

async function main(): Promise<void> {
  const { prisma } = await import('../db/prisma.js');
  try {
    await backfillBandcampIds({
      findPending: () =>
        prisma.post.findMany({
          where: { linkPlatform: 'BANDCAMP', bandcampItemId: null },
          select: { id: true, originalUrl: true },
          orderBy: { createdAt: 'asc' },
        }),
      readItemId: readBandcampItemId,
      save: async (postId, itemId) => {
        await prisma.post.update({ where: { id: postId }, data: { bandcampItemId: itemId } });
      },
      write: (line) => process.stdout.write(line),
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Backfill failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
    );
    process.exitCode = 1;
  });
}
