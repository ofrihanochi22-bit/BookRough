/**
 * Valid snapshot payloads for the Admin → Overview tests
 * (docs/features/admin-overview.md §4.4). Each builder takes overrides, so a
 * test changes only the field it is about.
 */

const GB = 1e9;

export const LIVE_SHA = 'b5d7d5a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7';
export const ROLLBACK_SHA = '0a07dac1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7';
export const OLD_SHA = '45d7c8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7';

export function usagePayload(
  overrides: {
    images?: number;
    functions?: number;
    deployment?: number;
    others?: { name: string; pct: number }[];
  } = {},
) {
  return {
    period: 'Oct 18, 10:00 - Nov 17, 10:00',
    storage: {
      functions: { usedBytes: overrides.functions ?? 0.824 * GB, limitBytes: 10 * GB },
      images: { usedBytes: overrides.images ?? 4.55 * GB, limitBytes: 10 * GB },
      deployment: { usedBytes: overrides.deployment ?? 1_720_000, limitBytes: 10 * GB },
    },
    others: overrides.others ?? [
      { name: 'Fluid Active CPU', pct: 10.2 },
      { name: 'Edge Requests', pct: 3 },
    ],
  };
}

export function imagesPayload(
  overrides: {
    images?: { tags: string[]; digest: string; sizeBytes: number; publishedAt: string | null }[];
    deleted?: { tags: string[]; digest: string; sizeBytes: number }[];
  } = {},
) {
  return {
    images: overrides.images ?? [
      {
        tags: [LIVE_SHA.slice(0, 12)],
        digest: 'aaaaaaaaaaaa',
        sizeBytes: 412_000_000,
        publishedAt: '2026-11-17T09:00:00.000Z',
      },
      {
        tags: [OLD_SHA.slice(0, 12)],
        digest: 'bbbbbbbbbbbb',
        sizeBytes: 410_000_000,
        publishedAt: '2026-11-16T09:00:00.000Z',
      },
    ],
    deleted: overrides.deleted ?? [],
  };
}

type Verdict = 'keep (live)' | 'keep (rollback)' | 'keep (unfinished)' | 'keep' | 'delete';

export function deploymentsPayload(
  overrides: {
    dryRun?: boolean;
    deployments?: {
      id: string;
      sha: string | null;
      createdAt: string;
      state: string;
      target: string | null;
      verdict: Verdict;
    }[];
    deleted?: { id: string; sha: string | null; createdAt: string }[];
  } = {},
) {
  return {
    dryRun: overrides.dryRun ?? false,
    liveId: 'dpl_live',
    deployments: overrides.deployments ?? [
      {
        id: 'dpl_live',
        sha: LIVE_SHA,
        createdAt: '2026-11-17T09:00:00.000Z',
        state: 'READY',
        target: 'production',
        verdict: 'keep (live)' as const,
      },
      {
        id: 'dpl_rollback',
        sha: ROLLBACK_SHA,
        createdAt: '2026-11-16T09:00:00.000Z',
        state: 'READY',
        target: 'production',
        verdict: 'keep (rollback)' as const,
      },
    ],
    deleted: overrides.deleted ?? [],
  };
}
