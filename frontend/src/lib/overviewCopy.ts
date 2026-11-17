import type { DeploymentVerdict, OverviewStatus } from '../api/admin';

/**
 * Wording and number formats for Admin → Overview
 * (docs/features/admin-overview.md §5). Pure, so each rule is a unit test.
 */

const DECIMAL_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const;
const BINARY_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Vercel shows decimal units (1 GB = 10⁹ B), so its meters read the same here
 * as on its Usage page. The database limit is set in binary megabytes, as Neon
 * counts them, so it uses `binary`.
 */
export function formatBytes(bytes: number, base: 'decimal' | 'binary' = 'decimal'): string {
  const step = base === 'decimal' ? 1000 : 1024;
  const units = base === 'decimal' ? DECIMAL_UNITS : BINARY_UNITS;
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= step && unit < units.length - 1) {
    value /= step;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const text = `${Number(value.toFixed(digits))} ${units[unit]}`;
  return bytes < 0 ? `-${text}` : text;
}

/** "+0.4 GB", "-1.2 GB", "No change"; null when there is no previous reading. */
export function changeLabel(changeBytes: number | null): string | null {
  if (changeBytes === null) return null;
  if (changeBytes === 0) return 'No change';
  return changeBytes > 0 ? `+${formatBytes(changeBytes)}` : formatBytes(changeBytes);
}

export const STATUS_LABEL: Record<OverviewStatus, string> = {
  ok: 'OK',
  watch: 'Watch',
  stop: 'Stop',
};

export function percentLabel(pct: number): string {
  return `${Number(pct.toFixed(1))}%`;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function ageLabel(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

/** What each tool is called on the page. */
export const SOURCE_LABEL = {
  usage: '/vercel-usage',
  images: '/vercel-image-cleanup',
  deployments: 'prune-deployments (CI)',
} as const;

/**
 * `deleted` is Vercel's confirmation: a planned deletion that failed part-way
 * through a run is still there, and says so.
 */
export function verdictLabel(
  verdict: DeploymentVerdict,
  dryRun: boolean,
  deleted: boolean,
): string {
  switch (verdict) {
    case 'keep (live)':
      return 'Live';
    case 'keep (rollback)':
      return 'Rollback';
    case 'keep (unfinished)':
      return 'Building';
    case 'keep':
      return 'Kept';
    case 'delete':
      if (dryRun) return 'Would be deleted';
      return deleted ? 'Deleted' : 'Not deleted (the run stopped)';
  }
}

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const shortDateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "4 Oct 2026" — the admin area's date (its lists and the Overview share it). */
export function formatDate(iso: string): string {
  return longDate.format(new Date(iso));
}
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return shortDateTime.format(new Date(iso));
}

/** `countingSince` is a bare UTC day (YYYY-MM-DD). */
export function formatDay(day: string): string {
  return formatDate(`${day}T12:00:00Z`);
}

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

export function shortSha(sha: string | null): string {
  return sha === null ? 'No commit' : sha.slice(0, 7);
}
