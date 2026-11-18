import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Config,
  type Deployment,
  buildPruneSnapshot,
  DEFAULT_INGEST_URL,
  deleteDeployment,
  describeEntry,
  failureDetail,
  listDeployments,
  planDeploymentPrune,
  postSnapshot,
  readConfig,
  readLiveId,
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
    promoted: true,
    rollbackCandidate: false,
    substate: 'PROMOTED',
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
  const staged = { promoted: false, substate: 'STAGED' };

  it('keeps the live and the newest other promoted READY, and deletes older ones', () => {
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

  it('keeps the live one when it is not the newest, paired with the newest other promoted', () => {
    // Arrange: rolled back from 3 to 2.
    const list = [deployment(1), deployment(2), deployment(3)];

    // Act
    const result = verdicts(list, 'dpl_2');

    // Assert
    expect(result).toEqual({ dpl_3: 'keep (rollback)', dpl_2: 'keep (live)', dpl_1: 'delete' });
  });

  it("always keeps Vercel's own rollback candidates", () => {
    // Arrange
    const list = [deployment(1, { rollbackCandidate: true }), deployment(2), deployment(3)];

    // Act
    const result = verdicts(list, 'dpl_3');

    // Assert
    expect(result).toEqual({
      dpl_3: 'keep (live)',
      dpl_2: 'keep (rollback)',
      dpl_1: 'keep (rollback)',
    });
  });

  it('deletes nothing with two promoted deployments or fewer', () => {
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
      const list = [deployment(1), deployment(2), deployment(3, { ...staged, state })];

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

  it('keeps a READY deployment newer than the live one that is not promoted yet, uncounted', () => {
    // Arrange: 3 built and is waiting on Deployment Checks.
    const list = [deployment(1), deployment(2), deployment(3, staged)];

    // Act
    const result = verdicts(list, 'dpl_2');

    // Assert
    expect(result).toEqual({
      dpl_3: 'keep (unfinished)',
      dpl_2: 'keep (live)',
      dpl_1: 'keep (rollback)',
    });
  });

  it('never makes a never-promoted READY deployment the rollback target, and deletes it', () => {
    // Arrange: 2 failed its checks and was never promoted; 3 was promoted after it.
    const list = [deployment(1), deployment(2, staged), deployment(3)];

    // Act
    const result = verdicts(list, 'dpl_3');

    // Assert
    expect(result).toEqual({ dpl_3: 'keep (live)', dpl_2: 'delete', dpl_1: 'keep (rollback)' });
  });

  it.each(['ERROR', 'CANCELED'])('deletes a superseded %s deployment', (state) => {
    // Arrange
    const list = [deployment(1), deployment(2, { ...staged, state }), deployment(3)];

    // Act
    const result = verdicts(list, 'dpl_3');

    // Assert
    expect(result.dpl_2).toBe('delete');
  });

  it('keeps the newest failure when nothing promoted came after it', () => {
    // Arrange
    const list = [deployment(1), deployment(2), deployment(3, { ...staged, state: 'ERROR' })];

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

  it('throws when the live deployment does not look promoted (the fields changed)', () => {
    // Arrange: without promotion fields every older READY one would look never-promoted.
    const list = [deployment(1, staged), deployment(2, staged)];

    // Act & Assert
    expect(() => planDeploymentPrune(list, { liveId: 'dpl_2', ...OPTIONS })).toThrowError(
      'The live deployment dpl_2 is not marked as promoted in the list; deleting nothing.',
    );
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
  it('prints id, time, short sha, state, flags, target and verdict', () => {
    // Act
    const line = describeEntry({
      deployment: deployment(1, { rollbackCandidate: true }),
      verdict: 'keep (rollback)',
    });

    // Assert
    expect(line).toBe(
      'dpl_1  1970-01-02T00:00:00.000Z  sha1000  READY/PROMOTED  promoted,rollback-candidate  production  → keep (rollback)',
    );
  });

  it('copes with no sha, no substate, no flags and no target', () => {
    // Act
    const line = describeEntry({
      deployment: deployment(1, { sha: '', substate: undefined, promoted: false, target: null }),
      verdict: 'keep',
    });

    // Assert
    expect(line).toBe('dpl_1  1970-01-02T00:00:00.000Z  (no sha)  READY  -  -  → keep');
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
    readySubstate: 'PROMOTED',
    aliasAssigned: day * DAY + 1000,
    isRollbackCandidate: false,
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
        promoted: false,
        rollbackCandidate: false,
        substate: undefined,
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

  it.each([
    ['aliasAssigned as a timestamp', { aliasAssigned: 5, readySubstate: 'X' }, true],
    ['aliasAssigned as true', { aliasAssigned: true, readySubstate: undefined }, true],
    ['readySubstate PROMOTED alone', { aliasAssigned: null, readySubstate: 'PROMOTED' }, true],
    ['neither', { aliasAssigned: null, readySubstate: 'STAGED' }, false],
    ['aliasAssigned 0', { aliasAssigned: 0, readySubstate: undefined }, false],
  ])('reads promotion from %s', async (_label, extra, promoted) => {
    // Arrange
    fetchMock.mockReturnValue(answer(200, { deployments: [raw(1, extra)] }));

    // Act
    const [first] = await listDeployments(config);

    // Assert
    expect(first?.promoted).toBe(promoted);
  });

  it('reads isRollbackCandidate, and only a literal true counts', async () => {
    // Arrange
    fetchMock.mockReturnValue(
      answer(200, {
        deployments: [
          raw(2, { isRollbackCandidate: true }),
          raw(1, { isRollbackCandidate: 'yes' }),
        ],
      }),
    );

    // Act
    const list = await listDeployments(config);

    // Assert
    expect(list.map((d) => d.rollbackCandidate)).toEqual([true, false]);
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

/* docs/features/admin-overview.md §8 — the snapshot the job posts to Admin → Overview. */
describe('buildPruneSnapshot', () => {
  const HEX = 'abcdef1'.padEnd(40, '0');
  const plan = () =>
    planDeploymentPrune(
      [deployment(5, { sha: HEX }), deployment(4, { sha: '' }), deployment(3), deployment(2)],
      { liveId: 'dpl_5', ...OPTIONS },
    );

  it('maps every planned deployment with its verdict, and lists only confirmed deletions', () => {
    // Act
    const snapshot = buildPruneSnapshot(
      plan(),
      'dpl_5',
      new Set(['dpl_3']),
      false,
      new Date(5 * DAY),
    );

    // Assert
    expect(snapshot.source).toBe('PRUNE_DEPLOYMENTS');
    expect(snapshot.capturedAt).toBe(new Date(5 * DAY).toISOString());
    expect(snapshot.payload.liveId).toBe('dpl_5');
    expect(snapshot.payload.dryRun).toBe(false);
    expect(snapshot.payload.deployments.map((d) => [d.id, d.verdict])).toEqual([
      ['dpl_5', 'keep (live)'],
      ['dpl_4', 'keep (rollback)'],
      ['dpl_3', 'delete'],
      ['dpl_2', 'delete'],
    ]);
    expect(snapshot.payload.deployments[0]?.sha).toBe(HEX);
    // An empty or non-hex SHA is sent as null rather than refused by the server.
    expect(snapshot.payload.deployments[1]?.sha).toBeNull();
    expect(snapshot.payload.deleted.map((d) => d.id)).toEqual(['dpl_3']);
  });

  it('lists no deletions on a dry run', () => {
    // Act
    const snapshot = buildPruneSnapshot(
      plan(),
      'dpl_5',
      new Set(['dpl_3']),
      true,
      new Date(5 * DAY),
    );

    // Assert
    expect(snapshot.payload.dryRun).toBe(true);
    expect(snapshot.payload.deleted).toEqual([]);
  });

  it('sends the newest 200 of a longer listing, plus any deletion past them', () => {
    // Arrange — 205 deployments, the oldest one deleted.
    const many = Array.from({ length: 205 }, (_, i) => ({
      deployment: deployment(300 - i),
      verdict: 'keep' as const,
    }));

    // Act
    const snapshot = buildPruneSnapshot(many, 'dpl_300', new Set(['dpl_96']), false, new Date());

    // Assert
    expect(snapshot.payload.deployments).toHaveLength(201);
    expect(snapshot.payload.deployments.at(-1)?.id).toBe('dpl_96');
  });
});

describe('postSnapshot', () => {
  const fetchMock = vi.fn();
  const snapshot = buildPruneSnapshot([], 'dpl_1', new Set(), true, new Date(DAY));
  const lines: string[] = [];
  const write = (line: string) => {
    lines.push(line);
  };

  beforeEach(() => {
    fetchMock.mockReset();
    lines.length = 0;
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts with the bearer token to the default URL and accepts 201', async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));

    // Act
    const line = await postSnapshot(snapshot, { OPS_INGEST_TOKEN: ' tok ' }, write);

    // Assert
    expect(line).toBe('Posted the Overview snapshot.\n');
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_INGEST_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
  });

  it('uses OPS_INGEST_URL when set', async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));

    // Act
    await postSnapshot(
      snapshot,
      { OPS_INGEST_TOKEN: 'tok', OPS_INGEST_URL: 'http://localhost:4000/api/ops/snapshots' },
      write,
    );

    // Assert
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:4000/api/ops/snapshots');
  });

  it('skips with a notice when the token is not set', async () => {
    // Act
    const line = await postSnapshot(snapshot, {}, write);

    // Assert
    expect(line).toMatch(/^::notice::OPS_INGEST_TOKEN is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lines).toEqual([line]);
  });

  it('warns, without throwing, when the app refuses the post', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'error', code: 401, message: 'Invalid ingest token.' }),
        { status: 401 },
      ),
    );

    // Act
    const line = await postSnapshot(snapshot, { OPS_INGEST_TOKEN: 'zq-secret-value-zq' }, write);

    // Assert — Vercel-style detail is printed, the token never is.
    expect(line).toMatch(/^::warning::Posting the Overview snapshot failed with HTTP 401/);
    expect(line).not.toContain('zq-secret-value-zq');
  });

  it('warns, without throwing, when the network fails', async () => {
    // Arrange
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    // Act
    const line = await postSnapshot(snapshot, { OPS_INGEST_TOKEN: 'tok' }, write);

    // Assert
    expect(line).toBe('::warning::Posting the Overview snapshot failed (getaddrinfo ENOTFOUND).\n');
  });
});
