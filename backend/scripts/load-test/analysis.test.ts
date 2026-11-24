import { describe, expect, it } from 'vitest';

import {
  classifyAnswer,
  judgeRound,
  judgeRun,
  percentile,
  pickLinks,
  scheduleOffsets,
  summarizeRound,
} from './analysis.js';
import { request, results, round } from './fixtures.js';

const created = (conversionPending: boolean, latencyMs = 3_000) =>
  ({
    kind: 'response',
    status: 201,
    body: { status: 'success', data: { post: { id: 'p1', conversionPending } } },
    latencyMs,
  }) as const;

describe('scheduleOffsets', () => {
  it('spreads 10 requests evenly over 5 s, the first at 0', () => {
    // Act
    const offsets = scheduleOffsets(10, 5_000);

    // Assert
    expect(offsets).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500]);
  });

  it('spreads 50 requests 100 ms apart, all inside the window', () => {
    // Act
    const offsets = scheduleOffsets(50, 5_000);

    // Assert
    expect(offsets).toHaveLength(50);
    expect(offsets[1]).toBe(100);
    expect(offsets.at(-1)).toBe(4_900);
  });

  it('rounds an uneven spread to whole milliseconds', () => {
    // Act
    const offsets = scheduleOffsets(3, 5_000);

    // Assert
    expect(offsets).toEqual([0, 1667, 3333]);
  });
});

describe('pickLinks', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];

  it('continues where the last round stopped', () => {
    // Act
    const links = pickLinks(pool, 2, 2);

    // Assert
    expect(links).toEqual(['c', 'd']);
  });

  it('wraps around the pool, staying distinct within the round', () => {
    // Act
    const links = pickLinks(pool, 4, 3);

    // Assert
    expect(links).toEqual(['e', 'a', 'b']);
    expect(new Set(links).size).toBe(3);
  });

  it('refuses a round larger than the pool', () => {
    // Act
    const pick = () => pickLinks(pool, 0, 6);

    // Assert
    expect(pick).toThrow(/needs 6 distinct links; the pool has 5/);
  });
});

describe('classifyAnswer', () => {
  it('reads a 201 with conversionPending false as converted', () => {
    // Act
    const result = classifyAnswer(created(false));

    // Assert
    expect(result).toEqual({ outcome: 'converted', failure: null, detail: null, postId: 'p1' });
  });

  it('reads a 201 with conversionPending true as pending, not a failure', () => {
    // Act
    const result = classifyAnswer(created(true, 11_900));

    // Assert
    expect(result).toEqual({ outcome: 'pending', failure: null, detail: null, postId: 'p1' });
  });

  it('accepts an answer at exactly the ceiling plus margin', () => {
    // Act
    const result = classifyAnswer(created(true, 13_000));

    // Assert
    expect(result.failure).toBeNull();
  });

  it('flags a 201 after 13 s as a ceiling breach, keeping the post', () => {
    // Act
    const result = classifyAnswer(created(true, 13_500));

    // Assert
    expect(result).toEqual({
      outcome: 'pending',
      failure: 'ceiling',
      detail: 'Answered after 13.5 s',
      postId: 'p1',
    });
  });

  it('treats a 201 without a readable post as a failure', () => {
    // Act
    const result = classifyAnswer({ kind: 'response', status: 201, body: null, latencyMs: 10 });

    // Assert
    expect(result).toMatchObject({ outcome: 'failed', failure: 'bad_body', postId: null });
  });

  it('treats a 5xx as a server error, with the backend message', () => {
    // Act
    const result = classifyAnswer({
      kind: 'response',
      status: 500,
      body: { status: 'error', code: 500, message: 'Something went wrong.' },
      latencyMs: 20,
    });

    // Assert
    expect(result).toEqual({
      outcome: 'failed',
      failure: 'server_error',
      detail: '500: Something went wrong.',
      postId: null,
    });
  });

  it('treats a 429 as rate limited', () => {
    // Act
    const result = classifyAnswer({ kind: 'response', status: 429, body: null, latencyMs: 5 });

    // Assert
    expect(result).toMatchObject({
      outcome: 'failed',
      failure: 'rate_limited',
      detail: 'HTTP 429',
    });
  });

  it('treats any other status as rejected', () => {
    // Act
    const result = classifyAnswer({
      kind: 'response',
      status: 422,
      body: { message: 'That link could not be found.' },
      latencyMs: 5,
    });

    // Assert
    expect(result).toMatchObject({
      failure: 'rejected',
      detail: '422: That link could not be found.',
    });
  });

  it('treats a thrown fetch as a network failure', () => {
    // Act
    const result = classifyAnswer({ kind: 'network', message: 'ECONNRESET', latencyMs: 50 });

    // Assert
    expect(result).toEqual({
      outcome: 'failed',
      failure: 'network',
      detail: 'ECONNRESET',
      postId: null,
    });
  });

  it('treats no answer as a timeout', () => {
    // Act
    const result = classifyAnswer({ kind: 'timeout', latencyMs: 30_000 });

    // Assert
    expect(result).toMatchObject({ outcome: 'failed', failure: 'timeout' });
  });
});

describe('percentile', () => {
  it('computes nearest-rank p50, p95 and p100', () => {
    // Arrange
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];

    // Act
    const p50 = percentile(values, 50);
    const p95 = percentile(values, 95);
    const p100 = percentile(values, 100);

    // Assert
    expect([p50, p95, p100]).toEqual([5, 10, 10]);
  });

  it('gives the only value for a single value', () => {
    // Act
    const p95 = percentile([7], 95);

    // Assert
    expect(p95).toBe(7);
  });

  it('gives null, not NaN, for no values', () => {
    // Act
    const p50 = percentile([], 50);

    // Assert
    expect(p50).toBeNull();
  });
});

describe('summarizeRound', () => {
  it('counts outcomes and uses only samples inside the round', () => {
    // Arrange
    const run = results();
    const target = run.rounds[0]!;

    // Act
    const summary = summarizeRound(target, run.samples, run.health, run.serverConversions);

    // Assert
    expect(summary).toMatchObject({
      size: 2,
      answered: 2,
      converted: 1,
      pending: 1,
      failed: 0,
      repeatedLinks: 0,
      conversionRate: 0.5,
      p50: 3_000,
      p95: 11_000,
      max: 11_000,
      peakMemoryMb: 330,
      worstHealthMs: 40,
      healthFailures: 0,
      pendingReasons: { timeout: 1 },
    });
  });

  it('gives empty figures for a round with no answers', () => {
    // Arrange
    const empty = round({
      requests: [request({ status: null, outcome: 'failed', failure: 'timeout', postId: null })],
    });

    // Act
    const summary = summarizeRound(empty, [], [], []);

    // Assert
    expect(summary).toMatchObject({
      answered: 0,
      failed: 1,
      p50: null,
      max: null,
      peakMemoryMb: null,
      worstHealthMs: null,
    });
  });

  it('counts repeated links and not-found answers', () => {
    // Arrange
    const target = round({ requests: [request({ repeatedLink: true }), request()] });

    // Act
    const summary = summarizeRound(
      target,
      [],
      [],
      [{ t: 2_000, outcome: 'not_found', reason: null, durationMs: 2_000 }],
    );

    // Assert
    expect(summary.repeatedLinks).toBe(1);
    expect(summary.pendingReasons).toEqual({ not_found: 1 });
  });
});

describe('judgeRound', () => {
  it('passes a round with converted and pending posts only', () => {
    // Act
    const verdict = judgeRound(round(), [], []);

    // Assert
    expect(verdict).toEqual({ passed: true, reasons: [] });
  });

  it('fails a round with request failures, counted by kind', () => {
    // Arrange
    const target = round({
      requests: [
        request({ outcome: 'failed', failure: 'server_error' }),
        request({ outcome: 'failed', failure: 'server_error' }),
        request({ outcome: 'pending', failure: 'ceiling' }),
      ],
    });

    // Act
    const verdict = judgeRound(target, [], []);

    // Assert
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons).toEqual(['2 × server error (5xx)', '1 × over the 12 s ceiling']);
  });

  it('fails a round with a missing post and a post saved for a failed request', () => {
    // Act
    const verdict = judgeRound(round({ dbCheck: { expected: 5, found: 6, missing: 1 } }), [], []);

    // Assert
    expect(verdict.reasons).toEqual([
      '1 saved post(s) missing from the database',
      '1 post(s) saved for a request that failed',
    ]);
  });

  it('fails a round the database was not checked for', () => {
    // Act
    const verdict = judgeRound(round({ dbCheck: null }), [], []);

    // Assert
    expect(verdict.reasons).toEqual(['database not checked']);
  });

  it('fails a round where the container ran out of memory and restarted', () => {
    // Act
    const verdict = judgeRound(
      round({ container: { running: false, oomKilled: true, restarts: 1 } }),
      [],
      [],
    );

    // Assert
    expect(verdict.reasons).toEqual([
      'container killed: out of memory',
      'container restarted 1 time(s)',
      'container stopped',
    ]);
  });

  it('fails a round with failed or slow health checks inside it, not outside', () => {
    // Arrange
    const health = [
      { t: 5_000, latencyMs: 5_000, ok: false },
      { t: 6_000, latencyMs: 2_500, ok: true },
      { t: 60_000, latencyMs: 4_000, ok: false },
    ];

    // Act
    const verdict = judgeRound(round(), health, []);

    // Assert
    expect(verdict.reasons).toEqual([
      '1 health check(s) failed',
      '1 health check(s) slower than 2 s',
    ]);
  });

  it('fails a round with an error-level log line inside it', () => {
    // Act
    const verdict = judgeRound(
      round(),
      [],
      [
        { t: 7_000, message: 'Unhandled error' },
        { t: 90_000, message: 'later' },
      ],
    );

    // Assert
    expect(verdict.reasons).toEqual(['1 error-level log line(s)']);
  });
});

describe('judgeRun', () => {
  it('passes a complete run whose rounds all passed', () => {
    // Act
    const verdict = judgeRun(results());

    // Assert
    expect(verdict).toEqual({ passed: true, reasons: [] });
  });

  it('fails an interrupted run, even when its rounds passed', () => {
    // Act
    const verdict = judgeRun(results({ complete: false, abortReason: 'interrupted (Ctrl+C)' }));

    // Assert
    expect(verdict).toEqual({ passed: false, reasons: ['incomplete: interrupted (Ctrl+C)'] });
  });

  it('fails a run with a failed round', () => {
    // Act
    const verdict = judgeRun(results({ rounds: [round({ dbCheck: null })] }));

    // Assert
    expect(verdict.reasons).toEqual(['round of 2 failed']);
  });

  it('never passes a run with no rounds', () => {
    // Act
    const verdict = judgeRun(results({ rounds: [] }));

    // Assert
    expect(verdict.passed).toBe(false);
  });
});
