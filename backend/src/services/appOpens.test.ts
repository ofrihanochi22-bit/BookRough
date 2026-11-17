import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordAppOpen, summariseOpens, utcDay } from './appOpens.js';

const { db } = vi.hoisted(() => ({
  db: {
    $executeRaw: vi.fn(),
    dailyAppOpens: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));

const NOW = new Date('2026-11-17T00:30:00.000Z');

function day(iso: string, signedIn: number, signedOut: number) {
  return { day: new Date(`${iso}T00:00:00.000Z`), signedIn, signedOut };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* docs/features/admin-overview.md §8 — unit, recordAppOpen and the summary */

describe('recordAppOpen', () => {
  it('adds a signed-in open to the UTC day, with bound values only', async () => {
    // Act
    await recordAppOpen(true, NOW);

    // Assert — a tagged template: the SQL text and its values arrive separately.
    const [strings, ...values] = db.$executeRaw.mock.calls[0]!;
    expect((strings as string[]).join('?')).toContain('ON CONFLICT ("day") DO UPDATE');
    expect(values).toEqual(['2026-11-17', 1, 0]);
  });

  it('adds a signed-out open to the other column', async () => {
    // Act
    await recordAppOpen(false, NOW);

    // Assert
    const [, ...values] = db.$executeRaw.mock.calls[0]!;
    expect(values).toEqual(['2026-11-17', 0, 1]);
  });

  it('passes a database failure to the caller', async () => {
    // Arrange
    db.$executeRaw.mockRejectedValue(new Error('down'));

    // Act + Assert
    await expect(recordAppOpen(true, NOW)).rejects.toThrow('down');
  });
});

describe('utcDay', () => {
  it('uses the UTC calendar day, not the local one', () => {
    // Act + Assert
    expect(utcDay(new Date('2026-11-16T23:59:59.000-02:00'))).toBe('2026-11-17');
  });
});

describe('summariseOpens', () => {
  it('sums today, the last 7 and the last 30 days at UTC day boundaries', async () => {
    // Arrange
    db.dailyAppOpens.findMany.mockResolvedValue([
      day('2026-11-17', 2, 1),
      day('2026-11-11', 3, 0), // 6 days ago: inside the 7
      day('2026-11-10', 4, 4), // 7 days ago: outside the 7
      day('2026-10-19', 1, 1), // 29 days ago: inside the 30
    ]);
    db.dailyAppOpens.findFirst.mockResolvedValue({ day: new Date('2026-10-01T00:00:00.000Z') });

    // Act
    const summary = await summariseOpens(NOW);

    // Assert
    expect(summary).toEqual({
      today: { signedIn: 2, signedOut: 1 },
      last7Days: { signedIn: 5, signedOut: 1 },
      last30Days: { signedIn: 10, signedOut: 6 },
      countingSince: '2026-10-01',
    });
    expect(db.dailyAppOpens.findMany).toHaveBeenCalledWith({
      where: { day: { gte: new Date('2026-10-19T00:00:00.000Z') } },
    });
  });

  it('is all zeros with no counting date when nothing was ever counted', async () => {
    // Arrange
    db.dailyAppOpens.findMany.mockResolvedValue([]);
    db.dailyAppOpens.findFirst.mockResolvedValue(null);

    // Act
    const summary = await summariseOpens(NOW);

    // Assert
    expect(summary.today).toEqual({ signedIn: 0, signedOut: 0 });
    expect(summary.countingSince).toBeNull();
  });
});
