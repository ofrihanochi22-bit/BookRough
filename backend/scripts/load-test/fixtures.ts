/** Builders for the load test's unit tests — not used by the run itself. */
import type { RequestResult, RoundResult, RunResults } from './types.js';

export function request(overrides: Partial<RequestResult> = {}): RequestResult {
  return {
    round: 10,
    index: 0,
    url: 'https://music.apple.com/il/album/x/1?i=2',
    repeatedLink: false,
    sentAt: 1_000,
    answeredAt: 4_000,
    latencyMs: 3_000,
    status: 201,
    outcome: 'converted',
    failure: null,
    detail: null,
    postId: 'post-1',
    ...overrides,
  };
}

export function round(overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    size: 2,
    startedAt: 1_000,
    endedAt: 15_000,
    requests: [
      request({ index: 0, postId: 'post-1' }),
      request({
        index: 1,
        sentAt: 3_500,
        answeredAt: 14_500,
        latencyMs: 11_000,
        outcome: 'pending',
        postId: 'post-2',
      }),
    ],
    dbCheck: { expected: 2, found: 2, missing: 0 },
    container: { running: true, oomKilled: false, restarts: 0 },
    ...overrides,
  };
}

export function results(overrides: Partial<RunResults> = {}): RunResults {
  return {
    startedAt: '2026-11-23T10:00:00.000Z',
    finishedAt: '2026-11-23T10:05:00.000Z',
    complete: true,
    abortReason: null,
    plannedRounds: [2],
    environment: {
      commit: 'abc1234',
      image: 'bookrough-backend:loadtest (0123456789ab)',
      memoryLimit: '2g',
      cpuLimit: '1',
      hostCpus: 8,
      hostMemoryGb: 16,
      hostPlatform: 'win32 10.0.26200',
      nodeInContainer: 'v24.21.0',
      playwright: '1.63.0',
    },
    rounds: [round()],
    samples: [
      { t: 2_000, memoryMb: 120, cpuPercent: 5 },
      { t: 8_000, memoryMb: 330, cpuPercent: 95 },
      { t: 20_000, memoryMb: 900, cpuPercent: 1 },
    ],
    health: [
      { t: 2_000, latencyMs: 5, ok: true },
      { t: 9_000, latencyMs: 40, ok: true },
    ],
    serverConversions: [
      { t: 4_000, outcome: 'converted', reason: null, durationMs: 3_000 },
      { t: 14_500, outcome: 'unavailable', reason: 'timeout', durationMs: 11_000 },
    ],
    serverErrors: [],
    ...overrides,
  };
}
