/**
 * Keeps the project's production deployments at the live one and its rollback target
 * (docs/features/deployment-pruning.md). Every production deployment stores a copy of the backend
 * image in Functions Storage, which Hobby caps at 10 GB.
 *
 * Run by main.yml's prune-deployments job with Node's own type stripping
 * (`node backend/src/ops/pruneDeployments.ts`), so it uses no package and no syntax beyond erasable
 * types. It talks to Vercel's REST API with fetch.
 *
 * It lists and decides on every run, and deletes only when PRUNE_DEPLOYMENTS is "delete". Until
 * the developer sets that repository variable, every run is a dry run whose plan can be read in
 * the job log first.
 */

import { pathToFileURL } from 'node:url';

export interface Deployment {
  id: string;
  /** Milliseconds since the epoch, as Vercel's `created`. */
  created: number;
  state: string;
  target: string | null;
  /**
   * Ever served production: Vercel's `aliasAssigned` is set, or `readySubstate` is `PROMOTED`. A
   * READY production deployment that is not promoted is waiting on Deployment Checks, or failed
   * them and never will be.
   */
  promoted: boolean;
  /** Vercel's own `isRollbackCandidate`: the deployments the dashboard can roll back to. */
  rollbackCandidate: boolean;
  /** `readySubstate`, for the log only. */
  substate: string | undefined;
  sha: string;
}

export type Verdict = 'keep (live)' | 'keep (rollback)' | 'keep (unfinished)' | 'keep' | 'delete';

export interface PlanEntry {
  deployment: Deployment;
  verdict: Verdict;
}

export interface PlanOptions {
  liveId: string;
  /** Promoted READY deployments to keep, the live one included. */
  keep: number;
  maxDeletes: number;
}

/**
 * Decides what to delete; pure, so every guard is a unit test. Throws rather than guessing whenever
 * the listing looks wrong. Returns the deployments newest first, each with its verdict.
 */
export function planDeploymentPrune(deployments: Deployment[], options: PlanOptions): PlanEntry[] {
  for (const deployment of deployments) {
    if (!Number.isFinite(deployment.created)) {
      throw new Error(
        `Deployment ${deployment.id} has an unreadable creation time; deleting nothing.`,
      );
    }
  }
  const live = deployments.find((deployment) => deployment.id === options.liveId);
  if (live === undefined) {
    throw new Error(`The live deployment ${options.liveId} is not in the list; deleting nothing.`);
  }
  // The live deployment is promoted by definition; if the list does not say so, Vercel's fields
  // have changed and "never promoted" can no longer be told apart.
  if (!live.promoted) {
    throw new Error(
      `The live deployment ${live.id} is not marked as promoted in the list; deleting nothing.`,
    );
  }

  const newestFirst = [...deployments].sort((a, b) => b.created - a.created);
  const production = newestFirst.filter((deployment) => deployment.target === 'production');
  const promotedReady = production.filter((d) => d.state === 'READY' && d.promoted);
  const kept = new Set<string>([live.id]);
  for (const deployment of promotedReady) {
    if (kept.size >= options.keep) break;
    kept.add(deployment.id);
  }
  const newestPromoted = promotedReady[0]?.created ?? -Infinity;

  const plan = newestFirst.map((deployment): PlanEntry => {
    const superseded = deployment.created < newestPromoted;
    let verdict: Verdict;
    if (deployment.id === live.id) verdict = 'keep (live)';
    else if (deployment.target !== 'production') verdict = 'keep';
    else if (kept.has(deployment.id) || deployment.rollbackCandidate) verdict = 'keep (rollback)';
    else if (deployment.state === 'READY' && deployment.promoted) verdict = 'delete';
    // Built but never promoted: newer than the live one, it may still be in checks; older, it
    // failed them, like a failed build.
    else if (deployment.state === 'READY') verdict = superseded ? 'delete' : 'keep (unfinished)';
    else if (deployment.state === 'ERROR' || deployment.state === 'CANCELED') {
      verdict = superseded ? 'delete' : 'keep';
    } else verdict = 'keep (unfinished)';
    return { deployment, verdict };
  });

  const deletes = plan.filter((entry) => entry.verdict === 'delete').length;
  if (deletes > options.maxDeletes) {
    throw new Error(
      `Refusing to delete ${deletes} deployments in one run (limit ${options.maxDeletes}); ` +
        'delete them in the dashboard, or check the listing.',
    );
  }
  return plan;
}

/**
 * Whether production can be pruned now. Vercel points the project's production target at the
 * newest production deployment as soon as it is built, even while Deployment Checks hold it
 * (docs/features/prune-waits-for-promotion.md §2). Such a target is "held": READY, production, not
 * promoted, and newer than every promoted deployment. Every other unpromoted shape means the listing
 * or Vercel's fields look wrong, so it throws rather than guess.
 */
export function liveStatus(deployments: Deployment[], liveId: string): 'promoted' | 'held' {
  const live = deployments.find((deployment) => deployment.id === liveId);
  if (live === undefined) {
    throw new Error(`The live deployment ${liveId} is not in the list; deleting nothing.`);
  }
  if (live.promoted) return 'promoted';
  const promoted = deployments.filter((deployment) => deployment.promoted);
  if (promoted.length === 0) {
    throw new Error('No deployment in the list is marked as promoted; deleting nothing.');
  }
  const newestPromoted = Math.max(...promoted.map((deployment) => deployment.created));
  if (live.state === 'READY' && live.target === 'production' && live.created > newestPromoted) {
    return 'held';
  }
  throw new Error(
    `The live deployment ${live.id} is not marked as promoted in the list; deleting nothing.`,
  );
}

export interface WaitOptions {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
  write: (line: string) => void;
}

export const DEFAULT_WAIT: WaitOptions = {
  attempts: 12,
  delayMs: 10_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  write: (line) => process.stdout.write(line),
};

/**
 * Reads the production target and the list until the target is promoted, at most `attempts` times
 * (docs/features/prune-waits-for-promotion.md §3). Returns them, or `null` when production is still
 * held in checks after the last attempt, after printing a warning: the caller then prunes nothing.
 */
export async function readPromotedLive(
  config: Config,
  wait: WaitOptions = DEFAULT_WAIT,
): Promise<{ liveId: string; deployments: Deployment[] } | null> {
  for (let attempt = 1; ; attempt += 1) {
    const liveId = await readLiveId(config);
    const deployments = await listDeployments(config);
    if (liveStatus(deployments, liveId) === 'promoted') return { liveId, deployments };
    if (attempt >= wait.attempts) {
      wait.write(
        `::warning::Production deployment ${liveId} is still waiting in Deployment Checks; pruning nothing this run.\n`,
      );
      return null;
    }
    wait.write(
      `Production deployment ${liveId} is waiting in Deployment Checks; reading again in ${wait.delayMs / 1000} s (attempt ${attempt} of ${wait.attempts}).\n`,
    );
    await wait.sleep(wait.delayMs);
  }
}

export interface Config {
  token: string;
  team: string;
  project: string;
  deleting: boolean;
}

export function readConfig(source: NodeJS.ProcessEnv): Config {
  const required = (name: string): string => {
    const value = source[name]?.trim();
    if (!value) {
      throw new Error(`${name} is not set.`);
    }
    return value;
  };
  return {
    token: required('VERCEL_TOKEN'),
    team: required('VERCEL_TEAM'),
    project: source.VERCEL_PROJECT?.trim() || 'bookrough',
    deleting: source.PRUNE_DEPLOYMENTS === 'delete',
  };
}

/**
 * Vercel's own reason for a failed response, for the job log: `error.code` and `error.message` from
 * its JSON error shape, or the start of the raw body. One line, at most 300 characters. The request
 * carries the token only in a header, and Vercel does not echo it, so nothing secret is printed.
 */
export async function failureDetail(response: Response): Promise<string> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return '(no response body)';
  }
  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: unknown; message?: unknown } };
    const { code, message } = parsed.error ?? {};
    const parts = [code, message].filter((part): part is string => typeof part === 'string');
    if (parts.length > 0) detail = parts.join(': ');
  } catch {
    // Not JSON: keep the raw text.
  }
  const line = detail.replace(/\s+/g, ' ').trim();
  if (line === '') return '(empty response body)';
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}

const API = 'https://api.vercel.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

function headers(config: Config): Record<string, string> {
  return { Authorization: `Bearer ${config.token}` };
}

/** The id of the deployment production is aliased to now. */
export async function readLiveId(config: Config): Promise<string> {
  const params = new URLSearchParams({ slug: config.team });
  const response = await fetch(
    `${API}/v9/projects/${encodeURIComponent(config.project)}?${params}`,
    { headers: headers(config) },
  );
  if (!response.ok) {
    throw new Error(
      `Reading project ${config.project} failed with HTTP ${response.status} (${await failureDetail(response)}); deleting nothing.`,
    );
  }
  const body = (await response.json()) as { targets?: { production?: { id?: unknown } } } | null;
  const id = body?.targets?.production?.id;
  if (typeof id !== 'string' || id === '') {
    throw new Error('The project has no readable production deployment; deleting nothing.');
  }
  return id;
}

function toDeployment(raw: Record<string, unknown>): Deployment {
  const state = raw.readyState ?? raw.state;
  if (typeof raw.uid !== 'string' || typeof raw.created !== 'number' || typeof state !== 'string') {
    throw new Error('A deployment in the list has an unexpected shape; deleting nothing.');
  }
  const meta = (raw.meta ?? {}) as Record<string, unknown>;
  return {
    id: raw.uid,
    created: raw.created,
    state,
    target: typeof raw.target === 'string' ? raw.target : null,
    promoted:
      (typeof raw.aliasAssigned === 'number' && raw.aliasAssigned > 0) ||
      raw.aliasAssigned === true ||
      raw.readySubstate === 'PROMOTED',
    rollbackCandidate: raw.isRollbackCandidate === true,
    substate: typeof raw.readySubstate === 'string' ? raw.readySubstate : undefined,
    sha: typeof meta.githubCommitSha === 'string' ? meta.githubCommitSha : '',
  };
}

/** Every production deployment of the project, following Vercel's `pagination.next`. */
export async function listDeployments(config: Config): Promise<Deployment[]> {
  const deployments: Deployment[] = [];
  let until: number | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      projectId: config.project,
      slug: config.team,
      target: 'production',
      limit: String(PAGE_LIMIT),
      ...(until !== undefined ? { until: String(until) } : {}),
    });
    const response = await fetch(`${API}/v6/deployments?${params}`, { headers: headers(config) });
    if (!response.ok) {
      throw new Error(
        `Listing the deployments of ${config.project} failed with HTTP ${response.status} (${await failureDetail(response)}); deleting nothing.`,
      );
    }
    const body = (await response.json()) as {
      deployments?: unknown;
      pagination?: { next?: unknown };
    } | null;
    if (!Array.isArray(body?.deployments)) {
      throw new Error('The deployment list has an unexpected shape; deleting nothing.');
    }
    deployments.push(...(body.deployments as Record<string, unknown>[]).map(toDeployment));
    const next = body.pagination?.next;
    if (typeof next !== 'number') {
      return deployments;
    }
    until = next;
  }
  throw new Error(`More than ${MAX_PAGES} pages of deployments; deleting nothing.`);
}

export async function deleteDeployment(config: Config, deployment: Deployment): Promise<void> {
  const params = new URLSearchParams({ slug: config.team });
  const response = await fetch(
    `${API}/v13/deployments/${encodeURIComponent(deployment.id)}?${params}`,
    { method: 'DELETE', headers: headers(config) },
  );
  // 404: already gone (deleted by hand, or by a run at the same time).
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Deleting ${deployment.id} failed with HTTP ${response.status} (${await failureDetail(response)}).`,
    );
  }
}

export function describeEntry(entry: PlanEntry): string {
  const { deployment, verdict } = entry;
  const created = new Date(deployment.created).toISOString();
  const sha = deployment.sha === '' ? '(no sha)' : deployment.sha.slice(0, 7);
  const substate = deployment.substate ? `/${deployment.substate}` : '';
  const flags = [
    deployment.promoted ? 'promoted' : '',
    deployment.rollbackCandidate ? 'rollback-candidate' : '',
  ]
    .filter(Boolean)
    .join(',');
  return `${deployment.id}  ${created}  ${sha}  ${deployment.state}${substate}  ${flags || '-'}  ${deployment.target ?? '-'}  → ${verdict}`;
}

/**
 * The snapshot Admin → Overview shows (docs/features/admin-overview.md §6.3). `deletedIds` holds
 * only deletions Vercel confirmed (200, or 404 for already gone); a dry run deleted nothing.
 */
export interface PruneSnapshot {
  source: 'PRUNE_DEPLOYMENTS';
  capturedAt: string;
  payload: {
    dryRun: boolean;
    liveId: string;
    deployments: {
      id: string;
      sha: string | null;
      createdAt: string;
      state: string;
      target: string | null;
      verdict: Verdict;
    }[];
    deleted: { id: string; sha: string | null; createdAt: string }[];
  };
}

function shaOrNull(sha: string): string | null {
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
}

/** The Overview stores at most this many deployments per snapshot (admin-overview.md §4.4). */
export const SNAPSHOT_DEPLOYMENTS = 200;

export function buildPruneSnapshot(
  plan: PlanEntry[],
  liveId: string,
  deletedIds: ReadonlySet<string>,
  dryRun: boolean,
  capturedAt: Date,
): PruneSnapshot {
  // The plan is newest first; a listing past the cap sends its newest part, plus every deletion.
  const included = plan.filter(
    (entry, index) => index < SNAPSHOT_DEPLOYMENTS || deletedIds.has(entry.deployment.id),
  );
  const deployments = included.map(({ deployment, verdict }) => ({
    id: deployment.id,
    sha: shaOrNull(deployment.sha),
    createdAt: new Date(deployment.created).toISOString(),
    state: deployment.state.slice(0, 20),
    target: deployment.target === null ? null : deployment.target.slice(0, 20),
    verdict,
  }));
  return {
    source: 'PRUNE_DEPLOYMENTS',
    capturedAt: capturedAt.toISOString(),
    payload: {
      dryRun,
      liveId,
      deployments,
      deleted: dryRun
        ? []
        : deployments
            .filter((deployment) => deletedIds.has(deployment.id))
            .map(({ id, sha, createdAt }) => ({ id, sha, createdAt })),
    },
  };
}

export const DEFAULT_INGEST_URL = 'https://bookrough.vercel.app/api/ops/snapshots';

/**
 * Posts the snapshot to the app. Never throws: the dashboard is a view, and pruning is this job's
 * purpose, so a failure here is a warning in the log and the job stays green. Returns the line it
 * printed, for the tests.
 */
export async function postSnapshot(
  snapshot: PruneSnapshot,
  source: NodeJS.ProcessEnv,
  write: (line: string) => void = (line) => process.stdout.write(line),
): Promise<string> {
  const token = source.OPS_INGEST_TOKEN?.trim();
  const url = source.OPS_INGEST_URL?.trim() || DEFAULT_INGEST_URL;
  let line: string;
  if (!token) {
    line = '::notice::OPS_INGEST_TOKEN is not set; the Overview snapshot was not posted.\n';
  } else {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      line =
        response.status === 201
          ? 'Posted the Overview snapshot.\n'
          : `::warning::Posting the Overview snapshot failed with HTTP ${response.status} (${await failureDetail(response)}).\n`;
    } catch (error) {
      line = `::warning::Posting the Overview snapshot failed (${(error as Error).message}).\n`;
    }
  }
  write(line);
  return line;
}

/* v8 ignore start -- the entry point; every decision and call above is tested. */
export async function main(source: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = readConfig(source);
  const read = await readPromotedLive(config);
  // Still held after the wait: the warning is printed; the next push or the nightly run prunes.
  if (read === null) return;
  const { liveId, deployments } = read;
  const capturedAt = new Date();
  const plan = planDeploymentPrune(deployments, {
    liveId,
    keep: 2,
    maxDeletes: 10,
  });
  const doomed = plan.filter((entry) => entry.verdict === 'delete');
  const deleted = new Set<string>();
  const report = () =>
    postSnapshot(buildPruneSnapshot(plan, liveId, deleted, !config.deleting, capturedAt), source);

  process.stdout.write(`Live: ${liveId}\n${plan.map(describeEntry).join('\n')}\n`);
  process.stdout.write(
    `${config.deleting ? 'Deleting' : 'Would delete (dry run)'} ${doomed.length}.\n`,
  );
  try {
    if (!config.deleting || doomed.length === 0) {
      return;
    }
    // Production may have been re-pointed since it was read (a promote in the dashboard): plan
    // again rather than delete what might now be live.
    const liveNow = await readLiveId(config);
    if (liveNow !== liveId) {
      throw new Error(
        `Production moved from ${liveId} to ${liveNow} during the run; deleting nothing.`,
      );
    }
    for (const entry of doomed) {
      await deleteDeployment(config, entry.deployment);
      deleted.add(entry.deployment.id);
      process.stdout.write(`Deleted ${entry.deployment.id}\n`);
    }
  } finally {
    // Also after a failure part-way: what was deleted stays deleted, and the Overview says so.
    await report();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
/* v8 ignore stop */
