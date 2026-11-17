import { describe, expect, it } from 'vitest';

import {
  ageLabel,
  changeLabel,
  formatBytes,
  formatDay,
  percentLabel,
  shortSha,
  verdictLabel,
} from './overviewCopy';

/* docs/features/admin-overview.md §5 — the Overview's wording */

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1_720_000, '1.72 MB'],
    [824_000_000, '824 MB'],
    [4_550_000_000, '4.55 GB'],
    [10_000_000_000, '10 GB'],
    [-400_000_000, '-400 MB'],
  ])('shows %s bytes in decimal units as %s', (bytes, text) => {
    // Act + Assert
    expect(formatBytes(bytes)).toBe(text);
  });

  it('uses binary units for the database', () => {
    // Act + Assert
    expect(formatBytes(512 * 1024 * 1024, 'binary')).toBe('512 MB');
    expect(formatBytes(40 * 1024 * 1024, 'binary')).toBe('40 MB');
  });
});

describe('changeLabel', () => {
  it('signs a change, names no change, and is null without a previous reading', () => {
    // Act + Assert
    expect(changeLabel(400_000_000)).toBe('+400 MB');
    expect(changeLabel(-1_200_000_000)).toBe('-1.2 GB');
    expect(changeLabel(0)).toBe('No change');
    expect(changeLabel(null)).toBeNull();
  });
});

describe('ageLabel', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  it.each([
    [0, 'just now'],
    [1, '1 minute ago'],
    [59, '59 minutes ago'],
    [60, '1 hour ago'],
    [47 * 60, '47 hours ago'],
    [48 * 60, '2 days ago'],
  ])('%s minutes ago reads "%s"', (minutes, text) => {
    // Act + Assert
    expect(ageLabel(ago(minutes), now)).toBe(text);
  });

  it('never reads as the future when the clocks disagree', () => {
    // Act + Assert
    expect(ageLabel(ago(-3), now)).toBe('just now');
  });
});

describe('verdictLabel', () => {
  it.each([
    ['keep (live)', false, false, 'Live'],
    ['keep (rollback)', false, false, 'Rollback'],
    ['keep (unfinished)', false, false, 'Building'],
    ['keep', false, false, 'Kept'],
    ['delete', true, false, 'Would be deleted'],
    ['delete', false, true, 'Deleted'],
    ['delete', false, false, 'Not deleted (the run stopped)'],
  ] as const)('%s (dry run %s, confirmed %s) reads "%s"', (verdict, dryRun, deleted, text) => {
    // Act + Assert
    expect(verdictLabel(verdict, dryRun, deleted)).toBe(text);
  });
});

describe('the small formats', () => {
  it('shows a percentage to one decimal, a short SHA, and a counting day', () => {
    // Act + Assert
    expect(percentLabel(45.5)).toBe('45.5%');
    expect(percentLabel(60)).toBe('60%');
    expect(shortSha('b5d7d5a1c2d3e4f5')).toBe('b5d7d5a');
    expect(shortSha(null)).toBe('No commit');
    expect(formatDay('2026-11-17')).toBe('17 Nov 2026');
  });
});
