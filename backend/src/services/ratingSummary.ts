import { prisma } from '../db/prisma.js';
import { NO_RATINGS, type RatingSummary, summarize } from '../utils/ratingSummary.js';

/**
 * The summaries for a page of posts in one grouped query, never one per post
 * (docs/features/post-detail.md §4). Posts nobody rated are absent from the
 * map; read them through `summaryFor`.
 */
export async function ratingSummaries(postIds: string[]): Promise<Map<string, RatingSummary>> {
  if (postIds.length === 0) {
    return new Map();
  }
  const groups = await prisma.rating.groupBy({
    by: ['postId'],
    where: { postId: { in: postIds } },
    _sum: { score: true },
    _count: { _all: true },
  });
  return new Map(
    groups.map((group) => [group.postId, summarize(group._sum.score ?? 0, group._count._all)]),
  );
}

export function summaryFor(summaries: Map<string, RatingSummary>, postId: string): RatingSummary {
  return summaries.get(postId) ?? NO_RATINGS;
}
