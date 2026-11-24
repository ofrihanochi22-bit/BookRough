/**
 * The pure part of the load test: when to send, how to read an answer, and how
 * to judge a round (docs/features/load-test.md §4). No I/O, so it is unit-tested.
 */
import { CEILING_MARGIN_MS, CEILING_MS, HEALTH_SLOW_MS } from './config.js';
import type {
  FailureKind,
  HealthSample,
  Outcome,
  RoundResult,
  RunResults,
  ServerConversion,
  ServerError,
  StatSample,
} from './types.js';

/** Request k of n leaves k × window / n ms after the round starts: evenly spread, the first at 0. */
export function scheduleOffsets(count: number, windowMs: number): number[] {
  return Array.from({ length: count }, (_, k) => Math.round((k * windowMs) / count));
}

/**
 * `count` links from the pool, starting where the last round stopped and
 * wrapping around: distinct within a round, as long as the pool is at least as
 * large as the round.
 */
export function pickLinks(pool: readonly string[], offset: number, count: number): string[] {
  if (count > pool.length) {
    throw new Error(
      `A round of ${count} needs ${count} distinct links; the pool has ${pool.length}.`,
    );
  }
  return Array.from({ length: count }, (_, i) => pool[(offset + i) % pool.length] as string);
}

export type Answer =
  | { kind: 'response'; status: number; body: unknown; latencyMs: number }
  | { kind: 'timeout'; latencyMs: number }
  | { kind: 'network'; message: string; latencyMs: number };

export interface Classified {
  outcome: Outcome;
  failure: FailureKind | null;
  detail: string | null;
  postId: string | null;
}

function readPost(body: unknown): { id: string; conversionPending: boolean } | null {
  const post = (body as { data?: { post?: unknown } } | null)?.data?.post as
    { id?: unknown; conversionPending?: unknown } | undefined;
  if (typeof post?.id === 'string' && typeof post.conversionPending === 'boolean') {
    return { id: post.id, conversionPending: post.conversionPending };
  }
  return null;
}

function errorMessage(body: unknown): string | null {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : null;
}

/**
 * A 201 is converted or pending, and still a failure if it broke the ceiling:
 * the post was saved, but later than CLAUDE.md §7 promises.
 */
export function classifyAnswer(answer: Answer): Classified {
  if (answer.kind === 'timeout') {
    return { outcome: 'failed', failure: 'timeout', detail: 'No answer in time', postId: null };
  }
  if (answer.kind === 'network') {
    return { outcome: 'failed', failure: 'network', detail: answer.message, postId: null };
  }

  const { status, body, latencyMs } = answer;
  if (status === 201) {
    const post = readPost(body);
    if (!post) {
      return { outcome: 'failed', failure: 'bad_body', detail: '201 without a post', postId: null };
    }
    const outcome: Outcome = post.conversionPending ? 'pending' : 'converted';
    const late = latencyMs > CEILING_MS + CEILING_MARGIN_MS;
    return {
      outcome,
      failure: late ? 'ceiling' : null,
      detail: late ? `Answered after ${(latencyMs / 1000).toFixed(1)} s` : null,
      postId: post.id,
    };
  }

  const failure: FailureKind =
    status >= 500 ? 'server_error' : status === 429 ? 'rate_limited' : 'rejected';
  const message = errorMessage(body);
  return {
    outcome: 'failed',
    failure,
    detail: message ? `${status}: ${message}` : `HTTP ${status}`,
    postId: null,
  };
}

/** Nearest-rank percentile; null for no values, never NaN. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? null;
}

const within = (t: number, round: RoundResult): boolean =>
  t >= round.startedAt && t <= round.endedAt;

export interface RoundSummary {
  size: number;
  answered: number;
  converted: number;
  pending: number;
  failed: number;
  repeatedLinks: number;
  conversionRate: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
  peakMemoryMb: number | null;
  worstHealthMs: number | null;
  healthFailures: number;
  pendingReasons: Record<string, number>;
}

export function summarizeRound(
  round: RoundResult,
  samples: readonly StatSample[],
  health: readonly HealthSample[],
  conversions: readonly ServerConversion[],
): RoundSummary {
  const { requests } = round;
  const answered = requests.filter((r) => r.status !== null);
  const converted = requests.filter((r) => r.outcome === 'converted').length;
  const pending = requests.filter((r) => r.outcome === 'pending').length;
  const latencies = answered.map((r) => r.latencyMs);
  const roundSamples = samples.filter((s) => within(s.t, round));
  const roundHealth = health.filter((h) => within(h.t, round));
  const okHealth = roundHealth.filter((h) => h.ok).map((h) => h.latencyMs);

  const pendingReasons: Record<string, number> = {};
  for (const c of conversions.filter((c) => within(c.t, round) && c.outcome !== 'converted')) {
    const key = c.outcome === 'not_found' ? 'not_found' : (c.reason ?? 'unavailable');
    pendingReasons[key] = (pendingReasons[key] ?? 0) + 1;
  }

  return {
    size: round.size,
    answered: answered.length,
    converted,
    pending,
    failed: requests.filter((r) => r.failure !== null).length,
    repeatedLinks: requests.filter((r) => r.repeatedLink).length,
    conversionRate: requests.length === 0 ? null : converted / requests.length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    max: latencies.length === 0 ? null : Math.max(...latencies),
    peakMemoryMb:
      roundSamples.length === 0 ? null : Math.max(...roundSamples.map((s) => s.memoryMb)),
    worstHealthMs: okHealth.length === 0 ? null : Math.max(...okHealth),
    healthFailures: roundHealth.filter((h) => !h.ok).length,
    pendingReasons,
  };
}

const FAILURE_LABELS: Record<FailureKind, string> = {
  server_error: 'server error (5xx)',
  rate_limited: 'rate limited (429)',
  rejected: 'rejected',
  network: 'connection failed',
  timeout: 'no answer in 30 s',
  ceiling: 'over the 12 s ceiling',
  bad_body: 'unreadable answer',
};

export interface Verdict {
  passed: boolean;
  reasons: string[];
}

/** Any one failure of any kind fails the round (load-test.md §4.4). `pending` is never a failure. */
export function judgeRound(
  round: RoundResult,
  health: readonly HealthSample[],
  errors: readonly ServerError[],
): Verdict {
  const reasons: string[] = [];

  const counts = new Map<FailureKind, number>();
  for (const r of round.requests) {
    if (r.failure) {
      counts.set(r.failure, (counts.get(r.failure) ?? 0) + 1);
    }
  }
  for (const [kind, count] of counts) {
    reasons.push(`${count} × ${FAILURE_LABELS[kind]}`);
  }

  if (round.dbCheck) {
    if (round.dbCheck.missing > 0) {
      reasons.push(`${round.dbCheck.missing} saved post(s) missing from the database`);
    }
    if (round.dbCheck.found > round.dbCheck.expected) {
      reasons.push(
        `${round.dbCheck.found - round.dbCheck.expected} post(s) saved for a request that failed`,
      );
    }
  } else {
    reasons.push('database not checked');
  }

  if (round.container) {
    if (round.container.oomKilled) {
      reasons.push('container killed: out of memory');
    }
    if (round.container.restarts > 0) {
      reasons.push(`container restarted ${round.container.restarts} time(s)`);
    }
    if (!round.container.running) {
      reasons.push('container stopped');
    }
  }

  const roundHealth = health.filter((h) => within(h.t, round));
  const failedHealth = roundHealth.filter((h) => !h.ok).length;
  const slowHealth = roundHealth.filter((h) => h.ok && h.latencyMs > HEALTH_SLOW_MS).length;
  if (failedHealth > 0) {
    reasons.push(`${failedHealth} health check(s) failed`);
  }
  if (slowHealth > 0) {
    reasons.push(`${slowHealth} health check(s) slower than ${HEALTH_SLOW_MS / 1000} s`);
  }

  const roundErrors = errors.filter((e) => within(e.t, round)).length;
  if (roundErrors > 0) {
    reasons.push(`${roundErrors} error-level log line(s)`);
  }

  return { passed: reasons.length === 0, reasons };
}

/** The run's verdict: complete, and every round passed. */
export function judgeRun(results: RunResults): Verdict {
  const reasons: string[] = [];
  if (!results.complete) {
    reasons.push(`incomplete: ${results.abortReason ?? 'stopped early'}`);
  }
  results.rounds.forEach((round) => {
    const verdict = judgeRound(round, results.health, results.serverErrors);
    if (!verdict.passed) {
      reasons.push(`round of ${round.size} failed`);
    }
  });
  return { passed: reasons.length === 0 && results.rounds.length > 0, reasons };
}
