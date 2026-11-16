import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addChecks,
  type Config,
  type Deployment,
  deleteDeployment,
  describeEntry,
  failureDetail,
  listDeployments,
  planDeploymentPrune,
  readConfig,
  readLiveId,
  withChecks,
} from './pruneDeployments.js';

/* docs/features/deployment-pruning.md §7: every guard of the deployment prune. */
const DAY = 86_400_000;
const OPTIONS = { keep: 2, maxDeletes: 10 };

function deployment(day: number, overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: `dpl_${day}`,
    created: day * DAY,
    state: 'READY',
    target: 'production',
    checksState: 'completed',
    checksConclusion: 'succeeded',
    sha: `sha${day}`.padEnd(40, '0'),
    ...overrides,
  };
}

function verdicts(list: Deployment[], liveId: string, options = OPTIONS): Record<string, string> {
  return Object.fromEntries(
    planDeploymentPrune(list, { liveId, ...options }).map((entry) => [
      entry.deployment.id,
      entry.verdict,
    ]),
  );
}

describe('planDeploymentPrune', () => {
  it('keeps the live and the newest other READY, and deletes older READY ones', () => {
    // Arrange
    const list = [deployment(1), deployment(2), deployment(3), deployment(4)];

    // Act
    const result = verdicts(list, 'dpl_4');

    // Assert
    expect(result).toEqual({
      dpl_4: 'keep (live)',
      dpl_3: 'keep (rollback)',
      dpl_2: 'delete',
      dpl_1: 'delete',
    });
  });

  it('returns the plan newest first', () => {
    // Arrange
    const list = [deployment(1), deployment(3), deployment(2)];

    // Act
    const plan = planDeploymentPrune(list, { liveId: 'dpl_3', ...OPTIONS });

    // Assert
    expect(plan.map((entry) => entry.deployment.id)).toEqual(['dpl_3', 'dpl_2', 'dpl_1']);
  });

  it('keeps the live one when it is not the newest, paired with the newest other READY', () => {
    // Arrange: rolled back from 3 to 2.
    const list = [deployment(1), deployment(2), deployment(3)];

    // Act
    const result = verdicts(list, 'dpl_2');

    // Assert
    expect(result).toEqual({ dpl_3: 'keep (rollback)', dpl_2: 'keep (live)', dpl_1: 'delete' });
  });

  it('deletes nothing with two READY deployments or fewer', () => {
    // Act
    const two = verdicts([deployment(1), deployment(2)], 'dpl_2');
    const one = verdicts([deployment(1)], 'dpl_1');

    // Assert
    expect(Object.values(two)).not.toContain('delete');
    expect(one).toEqual({ dpl_1: 'keep (live)' });
  });

  it.each(['BUILDING', 'QUEUED', 'INITIALIZING', 'SOMETHING_NEW'])(
    'keeps a %s deployment and does not count it',
    (state) => {
      // Arrange
      const list = [deployment(1), deployment(2), deployment(3, { state })];

      // Act
      const result = verdicts(list, 'dpl_2');

      // Assert
      expect(result).toEqual({
        dpl_3: 'keep (unfinished)',
        dpl_2: 'keep (live)',
        dpl_1: 'keep (rollback)',
      });
    },
  );

  it.each(['registered', 'running'])(
    'keeps a READY deployment whose checks are %s, uncounted',
    (checksState) => {
      // Arrange
      const list = [
        deployment(1),
        deployment(2),
        deployment(3, { checksState, checksConclusion: undefined }),
      ];

      // Act
      const result = verdicts(list, 'dpl_2');

      // Assert
      expect(result.dpl_3).toBe('keep (unfinished)');
      expect(result.dpl_1).toBe('keep (rollback)');
    },
  );

  it('counts a READY deployment without Deployment Checks', () => {
    // Arrange
    const list = [
      deployment(1),
      deployment(2),
      deployment(3, { checksState: undefined, checksConclusion: undefined }),
    ];

    // Act
    const result = verdicts(list, 'dpl_2');

    // Assert
    expect(result).toEqual({ dpl_3: 'keep (rollback)', dpl_2: 'keep (live)', dpl_1: 'delete' });
  });

  it.each(['failed', 'canceled'])(
    'never makes a READY deployment whose checks %s the rollback target',
    (checksConclusion) => {
      // Arrange: 3 built but failed its checks, so it was never promoted.
      const list = [deployment(1), deployment(2), deployment(3, { checksConclusion })];

      // Act
      const result = verdicts(list, 'dpl_2');

      // Assert
      expect(result).toEqual({ dpl_3: 'keep', dpl_2: 'keep (live)', dpl_1: 'keep (rollback)' });
    },
  );

  it('deletes a READY deployment that failed its checks once a newer one is READY', () => {
    // Arrange
    const list = [deployment(1), deployment(2, { checksConclusion: 'failed' }), deployment(3)];

    // Act
    const result = verdicts(list, 'dpl_3');

    // Assert
    expect(result).toEqual({ dpl_3: 'keep (live)', dpl_2: 'delete', dpl_1: 'keep (rollback)' });
  });

  it.each(['ERROR', 'CANCELED'])('deletes a superseded %s deployment', (state) => {
    // Arrange
    const list = [deployment(1), deployment(2, { state }), deployment(3)];

    // Act
    const result = verdicts(list, 'dpl_3');

    // Assert
    expect(result.dpl_2).toBe('delete');
  });

  it('keeps the newest failure when nothing READY came after it', () => {
    // Arrange
    const list = [deployment(1), deployment(2), deployment(3, { state: 'ERROR' })];

    // Act
    const result = verdicts(list, 'dpl_2');

    // Assert
    expect(result).toEqual({ dpl_3: 'keep', dpl_2: 'keep (live)', dpl_1: 'keep (rollback)' });
  });

  it('keeps a deployment that is not a production one', () => {
    // Arrange
    const list = [deployment(1, { target: null }), deployment(2), deployment(3), deployment(4)];

    // Act
    const result = verdicts(list, 'dpl_4');

    // Assert
    expect(result.dpl_1).toBe('keep');
    expect(result.dpl_2).toBe('delete');
  });

  it('throws when the live deployment is not in the list', () => {
    // Act & Assert
    expect(() =>
      planDeploymentPrune([deployment(1)], { liveId: 'dpl_9', ...OPTIONS }),
    ).toThrowError('The live deployment dpl_9 is not in the list; deleting nothing.');
  });

  it('throws on an unreadable creation time', () => {
    // Arrange
    const list = [deployment(1), deployment(2, { created: Number.NaN })];

    // Act & Assert
    expect(() => planDeploymentPrune(list, { liveId: 'dpl_1', ...OPTIONS })).toThrowError(
      /dpl_2 has an unreadable creation time; deleting nothing/,
    );
  });

  it('throws rather than delete more than the limit', () => {
    // Arrange: 2 kept, 3 to delete, limit 2.
    const list = [1, 2, 3, 4, 5].map((day) => deployment(day));

    // Act & Assert
    expect(() =>
      planDeploymentPrune(list, { liveId: 'dpl_5', keep: 2, maxDeletes: 2 }),
    ).toThrowError(/Refusing to delete 3 deployments in one run \(limit 2\)/);
  });
});

describe('describeEntry', () => {
  it('prints id, time, short sha, state, checks, target and verdict', () => {
    // Act
    const line = describeEntry({ deployment: deployment(1), verdict: 'delete' });

    // Assert
    expect(line).toBe(
      'dpl_1  1970-01-02T00:00:00.000Z  sha1000  READY checks:completed/succeeded  production  → delete',
    );
  });

  it('copes with no sha, no checks and no target', () => {
    // Act
    const line = describeEntry({
      deployment: deployment(1, {
        sha: '',
        checksState: undefined,
        checksConclusion: undefined,
        target: null,
      }),
      verdict: 'keep',
    });

    // Assert
    expect(line).toBe('dpl_1  1970-01-02T00:00:00.000Z  (no sha)  READY  -  → keep');
  });

  it('prints checks without a conclusion', () => {
    // Act
    const line = describeEntry({
      deployment: deployment(1, { checksState: 'running', checksConclusion: undefined }),
      verdict: 'keep (unfinished)',
    });

    // Assert
    expect(line).toContain('READY checks:running  production');
  });
});

describe('readConfig', () => {
  const base = { VERCEL_TOKEN: 'token', VERCEL_TEAM: 'team' };

  it('is a dry run unless PRUNE_DEPLOYMENTS is exactly "delete"', () => {
    // Act & Assert
    expect(readConfig(base).deleting).toBe(false);
    expect(readConfig({ ...base, PRUNE_DEPLOYMENTS: 'yes' }).deleting).toBe(false);
    expect(readConfig({ ...base, PRUNE_DEPLOYMENTS: 'delete' }).deleting).toBe(true);
  });

  it('defaults the project to bookrough and accepts an override', () => {
    // Act & Assert
    expect(readConfig(base).project).toBe('bookrough');
    expect(readConfig({ ...base, VERCEL_PROJECT: ' other ' }).project).toBe('other');
  });

  it.each(['VERCEL_TOKEN', 'VERCEL_TEAM'])('throws when %s is missing or blank', (name) => {
    // Act & Assert
    expect(() => readConfig({ ...base, [name]: ' ' })).toThrowError(`${name} is not set.`);
    expect(() => readConfig({ ...base, [name]: undefined })).toThrowError(`${name} is not set.`);
  });
});

describe('the Vercel calls', () => {
  const config: Config = {
    token: 'secret-token',
    team: 'team',
    project: 'bookrough',
    deleting: true,
  };
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (status: number, body?: unknown) =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));

  const raw = (day: number, extra: Record<string, unknown> = {}) => ({
    uid: `dpl_${day}`,
    created: day * DAY,
    readyState: 'READY',
    target: 'production',
    checksState: 'completed',
    checksConclusion: 'succeeded',
    meta: { githubCommitSha: `sha${day}` },
    ...extra,
  });

  it('reads the live deployment id, sending the token only as a bearer header', async () => {
    // Arrange
    fetchMock.mockReturnValue(answer(200, { targets: { production: { id: 'dpl_live' } } }));

    // Act
    const id = await readLiveId(config);

    // Assert
    expect(id).toBe('dpl_live');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.vercel.com/v9/projects/bookrough?slug=team');
    expect(init.headers).toEqual({ Authorization: 'Bearer secret-token' });
  });

  it("fails with Vercel's reason when the project read is refused", async () => {
    // Arrange
    fetchMock.mockReturnValue(answer(403, { error: { code: 'forbidden', message: 'No access' } }));

    // Act & Assert
    await expect(readLiveId(config)).rejects.toThrowError(
      'Reading project bookrough failed with HTTP 403 (forbidden: No access); deleting nothing.',
    );
  });

  it.each([null, {}, { targets: {} }, { targets: { production: { id: '' } } }])(
    'fails when the project has no readable production deployment: %j',
    async (body) => {
      // Arrange
      fetchMock.mockReturnValue(answer(200, body));

      // Act & Assert
      await expect(readLiveId(config)).rejects.toThrowError(
        'The project has no readable production deployment; deleting nothing.',
      );
    },
  );

  it('lists production deployments across pages, following pagination.next', async () => {
    // Arrange
    fetchMock
      .mockReturnValueOnce(
        answer(200, { deployments: [raw(3), raw(2)], pagination: { next: 2 * DAY } }),
      )
      .mockReturnValueOnce(
        answer(200, {
          deployments: [{ uid: 'dpl_1', created: DAY, state: 'ERROR' }],
          pagination: { next: null },
        }),
      );

    // Act
    const list = await listDeployments(config);

    // Assert
    expect(list).toEqual([
      deployment(3, { sha: 'sha3' }),
      deployment(2, { sha: 'sha2' }),
      {
        id: 'dpl_1',
        created: DAY,
        state: 'ERROR',
        target: null,
        checksState: undefined,
        checksConclusion: undefined,
        sha: '',
      },
    ]);
    const [firstUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain('/v6/deployments?');
    expect(firstUrl).toContain('projectId=bookrough');
    expect(firstUrl).toContain('target=production');
    expect(firstUrl).not.toContain('until=');
    expect(firstUrl).not.toContain('secret-token');
    expect(init.headers).toEqual({ Authorization: 'Bearer secret-token' });
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`until=${2 * DAY}`);
  });

  it('prefers readyState over state', async () => {
    // Arrange
    fetchMock.mockReturnValue(
      answer(200, { deployments: [raw(1, { readyState: 'READY', state: 'BUILDING' })] }),
    );

    // Act
    const [first] = await listDeployments(config);

    // Assert
    expect(first?.state).toBe('READY');
  });

  it("fails with Vercel's reason when the listing is refused", async () => {
    // Arrange
    fetchMock.mockReturnValue(answer(403, { error: { code: 'forbidden' } }));

    // Act & Assert
    await expect(listDeployments(config)).rejects.toThrowError(
      'Listing the deployments of bookrough failed with HTTP 403 (forbidden); deleting nothing.',
    );
  });

  it.each([
    ['no deployment array', { items: [] }, /deployment list has an unexpected shape/],
    ['a null body', null, /deployment list has an unexpected shape/],
    [
      'a deployment without an id',
      { deployments: [{ created: 1, state: 'READY' }] },
      /deployment in the list/,
    ],
    [
      'a string creation time',
      { deployments: [{ uid: 'x', created: '1', state: 'READY' }] },
      /deployment in the list/,
    ],
    [
      'a deployment without a state',
      { deployments: [{ uid: 'x', created: 1 }] },
      /deployment in the list/,
    ],
  ])('fails on %s', async (_label, body, message) => {
    // Arrange
    fetchMock.mockReturnValue(answer(200, body));

    // Act & Assert
    await expect(listDeployments(config)).rejects.toThrowError(message);
  });

  it('gives up after too many pages', async () => {
    // Arrange
    fetchMock.mockImplementation(() => answer(200, { deployments: [], pagination: { next: 1 } }));

    // Act & Assert
    await expect(listDeployments(config)).rejects.toThrowError(/More than 10 pages/);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("reads a deployment's checks from its details", async () => {
    // Arrange
    fetchMock.mockReturnValue(
      answer(200, { id: 'dpl_1', checksState: 'completed', checksConclusion: 'failed' }),
    );
    const listed = deployment(1, { checksState: undefined, checksConclusion: undefined });

    // Act
    const result = await withChecks(config, listed);

    // Assert
    expect(result).toEqual({ ...listed, checksState: 'completed', checksConclusion: 'failed' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.vercel.com/v13/deployments/dpl_1?slug=team');
    expect(init.method).toBeUndefined();
    expect(init.headers).toEqual({ Authorization: 'Bearer secret-token' });
  });

  it('leaves the checks empty when the deployment has none', async () => {
    // Arrange
    fetchMock.mockReturnValue(answer(200, { id: 'dpl_1' }));

    // Act
    const result = await withChecks(config, deployment(1, { checksState: undefined }));

    // Assert
    expect(result.checksState).toBeUndefined();
    expect(result.checksConclusion).toBeUndefined();
  });

  it("fails with Vercel's reason when the details are refused", async () => {
    // Arrange
    fetchMock.mockReturnValue(answer(403, { error: { code: 'forbidden' } }));

    // Act & Assert
    await expect(withChecks(config, deployment(1))).rejects.toThrowError(
      'Reading the checks of dpl_1 failed with HTTP 403 (forbidden); deleting nothing.',
    );
  });

  it.each([null, { id: 'dpl_other' }, 'text'])(
    'fails when the details have an unexpected shape: %j',
    async (body) => {
      // Arrange
      fetchMock.mockReturnValue(answer(200, body));

      // Act & Assert
      await expect(withChecks(config, deployment(1))).rejects.toThrowError(
        'The details of dpl_1 have an unexpected shape; deleting nothing.',
      );
    },
  );

  it('reads checks only for READY production deployments other than the live one', async () => {
    // Arrange
    fetchMock.mockImplementation((url: string) => {
      const id = /deployments\/(dpl_\d+)/.exec(url)?.[1];
      return answer(200, { id, checksState: 'completed', checksConclusion: 'succeeded' });
    });
    const bare = { checksState: undefined, checksConclusion: undefined };
    const list = [
      deployment(5, bare),
      deployment(4, bare),
      deployment(3, { ...bare, state: 'ERROR' }),
      deployment(2, { ...bare, target: null }),
      deployment(1, { checksState: 'completed', checksConclusion: 'failed' }),
    ];

    // Act
    const result = await addChecks(config, list, 'dpl_5');

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/v13/deployments/dpl_4?');
    expect(result.map((d) => d.checksConclusion)).toEqual([
      undefined,
      'succeeded',
      undefined,
      undefined,
      'failed',
    ]);
  });

  it.each([200, 404])('treats a DELETE answered %i as done', async (status) => {
    // Arrange
    fetchMock.mockReturnValue(answer(status, { uid: 'dpl_1', state: 'DELETED' }));

    // Act
    await deleteDeployment(config, deployment(1));

    // Assert
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.vercel.com/v13/deployments/dpl_1?slug=team');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ Authorization: 'Bearer secret-token' });
  });

  it.each([403, 500])('fails on a DELETE answered %i, with the reason', async (status) => {
    // Arrange
    fetchMock.mockReturnValue(answer(status, { error: { code: 'nope', message: 'Not allowed' } }));

    // Act & Assert
    await expect(deleteDeployment(config, deployment(1))).rejects.toThrowError(
      `Deleting dpl_1 failed with HTTP ${status} (nope: Not allowed).`,
    );
  });
});

describe('failureDetail', () => {
  const response = (body: string | null, status = 403) => new Response(body, { status });

  it("reads Vercel's error code and message", async () => {
    // Act & Assert
    expect(
      await failureDetail(
        response(JSON.stringify({ error: { code: 'forbidden', message: 'No access' } })),
      ),
    ).toBe('forbidden: No access');
  });

  it('keeps the raw body when it is not JSON, on one line', async () => {
    // Act & Assert
    expect(await failureDetail(response('Bad\n  gateway'))).toBe('Bad gateway');
  });

  it('keeps JSON without an error object as it is', async () => {
    // Act & Assert
    expect(await failureDetail(response(JSON.stringify({ reason: 'plan' })))).toBe(
      '{"reason":"plan"}',
    );
  });

  it('says so when the body is empty', async () => {
    // Act & Assert
    expect(await failureDetail(response(null))).toBe('(empty response body)');
  });

  it('cuts a long body to 300 characters', async () => {
    // Act & Assert
    expect(await failureDetail(response('x'.repeat(500)))).toBe(`${'x'.repeat(300)}…`);
  });

  it('copes with a body that cannot be read', async () => {
    // Arrange
    const used = response('already read');
    await used.text();

    // Act & Assert
    expect(await failureDetail(used)).toBe('(no response body)');
  });
});
