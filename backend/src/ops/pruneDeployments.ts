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
  /** Deployment Checks: `registered`, `running`, `completed`, or absent when there are none. */
  checksState: string | undefined;
  /** How the checks ended: `succeeded`, `failed`, `skipped`, `canceled`, or absent. */
  checksConclusion: string | undefined;
  sha: string;
}

export type Verdict = 'keep (live)' | 'keep (rollback)' | 'keep (unfinished)' | 'keep' | 'delete';

export interface PlanEntry {
  deployment: Deployment;
  verdict: Verdict;
}

export interface PlanOptions {
  liveId: string;
  /** READY deployments to keep, the live one included. */
  keep: number;
  maxDeletes: number;
}

const FAILED_CHECKS = new Set(['failed', 'canceled']);

/** Built and past Deployment Checks, or without any: the only READY deployments that count. */
function isSettledReady(deployment: Deployment): boolean {
  return (
    deployment.state === 'READY' &&
    deployment.checksState !== 'registered' &&
    deployment.checksState !== 'running' &&
    !FAILED_CHECKS.has(deployment.checksConclusion ?? '')
  );
}

/**
 * A build that failed or was cancelled, or one that built but failed its Deployment Checks and so
 * will never be promoted: never a rollback target, deleted once a settled READY one is newer.
 */
function isFailed(deployment: Deployment): boolean {
  return (
    deployment.state === 'ERROR' ||
    deployment.state === 'CANCELED' ||
    (deployment.state === 'READY' &&
      deployment.checksState === 'completed' &&
      FAILED_CHECKS.has(deployment.checksConclusion ?? ''))
  );
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
  if (!deployments.some((deployment) => deployment.id === options.liveId)) {
    throw new Error(`The live deployment ${options.liveId} is not in the list; deleting nothing.`);
  }

  const newestFirst = [...deployments].sort((a, b) => b.created - a.created);
  const production = newestFirst.filter((deployment) => deployment.target === 'production');
  const ready = production.filter(isSettledReady);
  const kept = new Set<string>([options.liveId]);
  for (const deployment of ready) {
    if (kept.size >= options.keep) break;
    kept.add(deployment.id);
  }
  const newestReady = ready[0]?.created ?? -Infinity;

  const plan = newestFirst.map((deployment): PlanEntry => {
    let verdict: Verdict;
    if (deployment.id === options.liveId) verdict = 'keep (live)';
    else if (deployment.target !== 'production') verdict = 'keep';
    else if (kept.has(deployment.id)) verdict = 'keep (rollback)';
    else if (isSettledReady(deployment)) verdict = 'delete';
    else if (isFailed(deployment) && deployment.created < newestReady) verdict = 'delete';
    else if (isFailed(deployment)) verdict = 'keep';
    else verdict = 'keep (unfinished)';
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
    checksState: typeof raw.checksState === 'string' ? raw.checksState : undefined,
    checksConclusion: typeof raw.checksConclusion === 'string' ? raw.checksConclusion : undefined,
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

/**
 * Fills in a deployment's Deployment Checks from `GET /v13/deployments/{id}`: the list endpoint
 * leaves `checksState` and `checksConclusion` out (seen on the first run, 2026-11-16), so without
 * this a build that failed its checks would look like a promotable READY one.
 */
export async function withChecks(config: Config, deployment: Deployment): Promise<Deployment> {
  const params = new URLSearchParams({ slug: config.team });
  const response = await fetch(
    `${API}/v13/deployments/${encodeURIComponent(deployment.id)}?${params}`,
    { headers: headers(config) },
  );
  if (!response.ok) {
    throw new Error(
      `Reading the checks of ${deployment.id} failed with HTTP ${response.status} (${await failureDetail(response)}); deleting nothing.`,
    );
  }
  const body = (await response.json()) as Record<string, unknown> | null;
  if (body === null || typeof body !== 'object' || body.id !== deployment.id) {
    throw new Error(`The details of ${deployment.id} have an unexpected shape; deleting nothing.`);
  }
  return {
    ...deployment,
    checksState: typeof body.checksState === 'string' ? body.checksState : undefined,
    checksConclusion: typeof body.checksConclusion === 'string' ? body.checksConclusion : undefined,
  };
}

/** Reads the checks of every READY production deployment but the live one, which is kept anyway. */
export async function addChecks(
  config: Config,
  deployments: Deployment[],
  liveId: string,
): Promise<Deployment[]> {
  const result: Deployment[] = [];
  for (const deployment of deployments) {
    const needed =
      deployment.state === 'READY' &&
      deployment.target === 'production' &&
      deployment.id !== liveId &&
      deployment.checksState === undefined;
    result.push(needed ? await withChecks(config, deployment) : deployment);
  }
  return result;
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
  const checks = deployment.checksState
    ? ` checks:${deployment.checksState}${deployment.checksConclusion ? `/${deployment.checksConclusion}` : ''}`
    : '';
  return `${deployment.id}  ${created}  ${sha}  ${deployment.state}${checks}  ${deployment.target ?? '-'}  → ${verdict}`;
}

/* v8 ignore start -- the entry point; every decision and call above is tested. */
export async function main(source: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = readConfig(source);
  const liveId = await readLiveId(config);
  const listed = await addChecks(config, await listDeployments(config), liveId);
  const plan = planDeploymentPrune(listed, {
    liveId,
    keep: 2,
    maxDeletes: 10,
  });
  const doomed = plan.filter((entry) => entry.verdict === 'delete');

  process.stdout.write(`Live: ${liveId}\n${plan.map(describeEntry).join('\n')}\n`);
  process.stdout.write(
    `${config.deleting ? 'Deleting' : 'Would delete (dry run)'} ${doomed.length}.\n`,
  );
  if (!config.deleting || doomed.length === 0) {
    return;
  }
  // Production may have been re-pointed since it was read (a promote in the dashboard): plan again
  // rather than delete what might now be live.
  const liveNow = await readLiveId(config);
  if (liveNow !== liveId) {
    throw new Error(
      `Production moved from ${liveId} to ${liveNow} during the run; deleting nothing.`,
    );
  }
  for (const entry of doomed) {
    await deleteDeployment(config, entry.deployment);
    process.stdout.write(`Deleted ${entry.deployment.id}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
/* v8 ignore stop */
