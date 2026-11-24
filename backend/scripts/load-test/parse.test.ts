import { describe, expect, it } from 'vitest';

import { parseMemoryMb, parseServerLog, parseStatsLine } from './parse.js';

describe('parseMemoryMb', () => {
  it.each([
    ['327.4MiB', 327.4],
    ['1.5GiB', 1536],
    ['512KiB', 0.5],
    ['118MB', 118],
  ])('reads %s', (text, expected) => {
    // Act
    const mb = parseMemoryMb(text);

    // Assert
    expect(mb).toBeCloseTo(expected);
  });

  it.each([['--'], ['12 parsecs'], ['']])('gives null for %j', (text) => {
    // Act
    const mb = parseMemoryMb(text);

    // Assert
    expect(mb).toBeNull();
  });
});

describe('parseStatsLine', () => {
  it('reads memory and CPU from a streamed line, ANSI codes and all', () => {
    // Arrange
    const line =
      '\u001b[2J\u001b[H{"BlockIO":"0B / 0B","CPUPerc":"87.25%","MemUsage":"327.4MiB / 2GiB","Name":"api"}';

    // Act
    const sample = parseStatsLine(line);

    // Assert
    expect(sample).toEqual({ memoryMb: 327.4, cpuPercent: 87.25 });
  });

  it.each([
    ['a blank line', ''],
    ['the stopped-container row', '{"CPUPerc":"--","MemUsage":"-- / --"}'],
    ['broken JSON', '{"CPUPerc":"1%",'],
    ['a row with no memory', '{"CPUPerc":"1%"}'],
  ])('gives null for %s', (_label, line) => {
    // Act
    const sample = parseStatsLine(line);

    // Assert
    expect(sample).toBeNull();
  });
});

describe('parseServerLog', () => {
  const start = Date.parse('2026-11-23T10:00:00.000Z');
  const line = (fields: Record<string, unknown>) => JSON.stringify(fields);

  it('reads conversions and error lines, timed from the run start', () => {
    // Arrange
    const text = [
      'Prisma schema loaded from prisma/schema.prisma',
      line({
        level: 30,
        time: '2026-11-23T10:00:05.000Z',
        msg: 'Link converted',
        durationMs: 3200,
      }),
      line({
        level: 40,
        time: '2026-11-23T10:00:12.000Z',
        msg: 'Link conversion unavailable',
        reason: 'timeout',
        durationMs: 12000,
      }),
      line({
        level: 30,
        time: '2026-11-23T10:00:13.000Z',
        msg: 'Link not found',
        durationMs: 2100,
      }),
      line({ level: 50, time: '2026-11-23T10:00:14.000Z', msg: 'Unhandled error' }),
      line({ level: 30, time: '2026-11-23T10:00:15.000Z', msg: 'Recommendation sent' }),
    ].join('\n');

    // Act
    const parsed = parseServerLog(text, start);

    // Assert
    expect(parsed.conversions).toEqual([
      { t: 5_000, outcome: 'converted', reason: null, durationMs: 3200 },
      { t: 12_000, outcome: 'unavailable', reason: 'timeout', durationMs: 12000 },
      { t: 13_000, outcome: 'not_found', reason: null, durationMs: 2100 },
    ]);
    expect(parsed.errors).toEqual([{ t: 14_000, message: 'Unhandled error' }]);
  });

  it('skips lines from before the run, broken JSON and Windows line endings', () => {
    // Arrange
    const text = [
      line({ level: 50, time: '2026-11-23T09:59:00.000Z', msg: 'old' }),
      '{"level":50,',
      line({ level: 60, time: '2026-11-23T10:00:01.000Z', msg: '' }),
    ].join('\r\n');

    // Act
    const parsed = parseServerLog(text, start);

    // Assert
    expect(parsed.conversions).toEqual([]);
    expect(parsed.errors).toEqual([{ t: 1_000, message: 'error' }]);
  });

  it('ignores a conversion line without a duration', () => {
    // Act
    const parsed = parseServerLog(
      line({ level: 30, time: '2026-11-23T10:00:05.000Z', msg: 'Link converted' }),
      start,
    );

    // Assert
    expect(parsed.conversions).toEqual([]);
  });
});
