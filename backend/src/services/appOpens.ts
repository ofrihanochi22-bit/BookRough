import { prisma } from '../db/prisma.js';

/**
 * The anonymous daily count of app opens (docs/features/admin-overview.md
 * §3.3, §4.5). Nothing about the request is stored: not the user, not the
 * address, not the device — one row per UTC day, two counters.
 */

/** A Date's UTC calendar day as `YYYY-MM-DD`. */
export function utcDay(time: Date): string {
  return time.toISOString().slice(0, 10);
}

/**
 * Adds one open to today's row, creating it on the day's first open.
 *
 * Raw SQL, deliberately (CLAUDE.md §4): two opens racing on a new day must
 * both count, which needs a single atomic `INSERT … ON CONFLICT … DO UPDATE`.
 * Prisma's `upsert` falls back to a read-then-write for an increment, which
 * can lose one of them or fail on the unique day. The values are bound
 * parameters, never interpolated text.
 */
export async function recordAppOpen(signedIn: boolean, now: Date = new Date()): Promise<void> {
  const day = utcDay(now);
  const inc = signedIn ? 1 : 0;
  const out = signedIn ? 0 : 1;
  await prisma.$executeRaw`
    INSERT INTO "daily_app_opens" ("day", "signed_in", "signed_out")
    VALUES (${day}::date, ${inc}, ${out})
    ON CONFLICT ("day") DO UPDATE SET
      "signed_in" = "daily_app_opens"."signed_in" + EXCLUDED."signed_in",
      "signed_out" = "daily_app_opens"."signed_out" + EXCLUDED."signed_out"`;
}

export interface OpenCounts {
  signedIn: number;
  signedOut: number;
}

export interface OpensSummary {
  today: OpenCounts;
  last7Days: OpenCounts;
  last30Days: OpenCounts;
  /** The first day anything was counted, or null when nothing has been. */
  countingSince: string | null;
}

/** Today, the last 7 and the last 30 UTC days (each including today). */
export async function summariseOpens(now: Date = new Date()): Promise<OpensSummary> {
  const today = new Date(`${utcDay(now)}T00:00:00.000Z`);
  const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000);
  const [rows, first] = await Promise.all([
    prisma.dailyAppOpens.findMany({ where: { day: { gte: daysAgo(29) } } }),
    prisma.dailyAppOpens.findFirst({ orderBy: { day: 'asc' }, select: { day: true } }),
  ]);
  const sum = (from: Date): OpenCounts =>
    rows
      .filter((row) => row.day.getTime() >= from.getTime())
      .reduce(
        (total, row) => ({
          signedIn: total.signedIn + row.signedIn,
          signedOut: total.signedOut + row.signedOut,
        }),
        { signedIn: 0, signedOut: 0 },
      );
  return {
    today: sum(today),
    last7Days: sum(daysAgo(6)),
    last30Days: sum(daysAgo(29)),
    countingSince: first ? utcDay(first.day) : null,
  };
}
