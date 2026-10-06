import { prisma } from '../db/prisma.js';

/**
 * Empties every table, so no test depends on rows another one left behind
 * (docs/tests.md §3.3). Extend the list as tables are added.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "communities", "community_bans", "posts", "bookmarks", "ratings", "friends", "app_settings", "setting_changes" RESTART IDENTITY CASCADE',
  );
}
