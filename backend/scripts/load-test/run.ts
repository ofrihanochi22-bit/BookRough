/**
 * Burst load test for sending recommendations — docs/features/load-test.md.
 *
 *   npm run load-test                       all rounds: 10, 20, 30, 40, 50
 *   npm run load-test -- --rounds 10,20     only these rounds
 *   npm run load-test -- --skip-build       reuse the image from the last run
 *
 * Builds the backend image, runs it locally at a Vercel Hobby instance's size
 * against its own database, sends each round of POST /api/recommendations over
 * five seconds, and writes out/<time>/report.html and results.json. Real
 * conversions through squigly.link: run it by hand, never on a schedule.
 * Exit code 0 when every round passed, 1 otherwise.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyAnswer,
  judgeRound,
  judgeRun,
  pickLinks,
  scheduleOffsets,
  summarizeRound,
  type Answer,
} from './analysis.js';
import {
  API_BASE,
  CLIENT_TIMEOUT_MS,
  COOLDOWN_MAX_MS,
  COOLDOWN_MIN_MS,
  CPU_LIMIT,
  HEALTH_INTERVAL_MS,
  HEALTH_TIMEOUT_MS,
  HOST_DATABASE_URL,
  MEMORY_LIMIT,
  parseRounds,
  STARTUP_TIMEOUT_MS,
  WINDOW_MS,
} from './config.js';
import { LoadTestDatabase, type Pair } from './database.js';
import {
  assertDockerRunning,
  buildImage,
  chromiumCount,
  containerClockOffset,
  containerState,
  dropDatabase,
  ensurePostgres,
  imageId,
  nodeInContainer,
  recreateDatabase,
  run,
  serverLogs,
  startApi,
  stopApi,
  streamStats,
} from './docker.js';
import { parseServerLog } from './parse.js';
import { renderReport } from './report.js';
import type { Environment, HealthSample, RequestResult, RoundResult, RunResults } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, '../..');
const repoRoot = resolve(backendDir, '..');

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Real track and album links from the mock data set; 84, enough for a round of 50. */
function loadLinks(): string[] {
  const songs = JSON.parse(
    readFileSync(join(backendDir, 'scripts/mock-data/songs.json'), 'utf8'),
  ) as Record<string, { apple: string }>;
  return Object.values(songs).map((song) => song.apple);
}

// --- one request, one round ----------------------------------------------------

async function send(pair: Pair, url: string): Promise<Answer> {
  const started = performance.now();
  const latency = (): number => Math.round(performance.now() - started);
  try {
    const response = await fetch(`${API_BASE}/api/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: pair.cookie },
      body: JSON.stringify({ recipientId: pair.recipientId, url }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    return { kind: 'response', status: response.status, body, latencyMs: latency() };
  } catch (error) {
    if ((error as Error).name === 'TimeoutError') {
      return { kind: 'timeout', latencyMs: latency() };
    }
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const message = cause?.code ?? cause?.message ?? (error as Error).message;
    return { kind: 'network', message, latencyMs: latency() };
  }
}

async function runRound(
  size: number,
  pairs: readonly Pair[],
  links: readonly string[],
  sentBefore: ReadonlySet<string>,
  now: () => number,
): Promise<RoundResult> {
  const startedAt = now();
  const requests = await Promise.all(
    scheduleOffsets(size, WINDOW_MS).map(async (offset, index): Promise<RequestResult> => {
      await sleep(Math.max(0, startedAt + offset - now()));
      const pair = pairs[index] as Pair;
      const url = links[index] as string;
      const sentAt = now();
      const answer = await send(pair, url);
      return {
        round: size,
        index,
        url,
        repeatedLink: sentBefore.has(url),
        sentAt,
        answeredAt: sentAt + answer.latencyMs,
        latencyMs: answer.latencyMs,
        status: answer.kind === 'response' ? answer.status : null,
        ...classifyAnswer(answer),
      };
    }),
  );
  return { size, startedAt, endedAt: now(), requests, dbCheck: null, container: null };
}

// --- the probes that run alongside ----------------------------------------------

function startHealthProbe(record: (sample: HealthSample) => void, now: () => number) {
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      const t = now();
      const started = performance.now();
      const ok = await fetch(`${API_BASE}/api/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      }).then(
        async (response) => {
          await response.arrayBuffer();
          return response.ok;
        },
        () => false,
      );
      const latencyMs = Math.round(performance.now() - started);
      record({ t, latencyMs, ok });
      await sleep(Math.max(0, HEALTH_INTERVAL_MS - latencyMs));
    }
  })();
  return {
    stop: async (): Promise<void> => {
      stopped = true;
      await loop;
    },
  };
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ok = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2_000) }).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) {
      return;
    }
    const state = await containerState().catch(() => null);
    if (state && !state.running) {
      const tail = (await serverLogs().catch(() => '')).split('\n').slice(-15).join('\n');
      throw new Error(`The API container stopped while starting:\n${tail}`);
    }
    await sleep(1_000);
  }
  throw new Error(`The API did not answer /api/health within ${STARTUP_TIMEOUT_MS / 1000} s.`);
}

/** At least COOLDOWN_MIN_MS, then until no Chromium is running (load-test.md §4.2). */
async function coolDown(): Promise<void> {
  const started = Date.now();
  await sleep(COOLDOWN_MIN_MS);
  while (Date.now() - started < COOLDOWN_MAX_MS && (await chromiumCount()) > 0) {
    await sleep(2_000);
  }
}

async function describeEnvironment(): Promise<Environment> {
  const commit = await run('git', ['rev-parse', '--short', 'HEAD'], repoRoot).catch(
    () => 'unknown',
  );
  const dirty = await run('git', ['status', '--porcelain'], repoRoot).catch(() => '');
  const pkg = JSON.parse(readFileSync(join(backendDir, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  return {
    commit: dirty ? `${commit} (with uncommitted changes)` : commit,
    image: await imageId(),
    memoryLimit: MEMORY_LIMIT,
    cpuLimit: CPU_LIMIT,
    hostCpus: cpus().length,
    hostMemoryGb: Math.round(totalmem() / 1024 ** 3),
    hostPlatform: `${platform()} ${release()}`,
    nodeInContainer: await nodeInContainer().catch(() => 'unknown'),
    playwright: pkg.dependencies.playwright ?? 'unknown',
  };
}

// --- the run --------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const rounds = parseRounds(argv);
  const skipBuild = argv.includes('--skip-build');

  const runStartedAtMs = Date.now();
  const now = (): number => Date.now() - runStartedAtMs;
  const results: RunResults = {
    startedAt: new Date(runStartedAtMs).toISOString(),
    finishedAt: null,
    complete: false,
    abortReason: null,
    plannedRounds: rounds,
    environment: null,
    rounds: [],
    samples: [],
    health: [],
    serverConversions: [],
    serverErrors: [],
  };
  const outDir = join(here, 'out', results.startedAt.replace(/[:.]/g, '-'));

  let interrupted = false;
  process.on('SIGINT', () => {
    if (interrupted) {
      process.exit(130);
    }
    interrupted = true;
    results.abortReason = 'interrupted (Ctrl+C)';
    say('Stopping after the current step. Press Ctrl+C again to quit without cleaning up.');
  });

  let containerStarted = false;
  /** The container's clock minus this machine's, so its log times line up with the rounds. */
  let clockOffsetMs = 0;
  let databaseCreated = false;
  let db: LoadTestDatabase | null = null;
  let stats: ReturnType<typeof streamStats> | null = null;
  let health: ReturnType<typeof startHealthProbe> | null = null;

  try {
    say('Checking Docker and Postgres…');
    await assertDockerRunning();
    await ensurePostgres(repoRoot);
    if (!skipBuild) {
      say('Building the backend image (a few minutes the first time)…');
      await buildImage(backendDir);
    }
    say('Creating the load-test database and starting the API…');
    await recreateDatabase();
    databaseCreated = true;
    const secret = randomBytes(48).toString('hex');
    // Set first: `docker run` can create the container and then fail to start it.
    containerStarted = true;
    await startApi(secret);
    await waitForHealth();
    results.environment = await describeEnvironment();
    clockOffsetMs = await containerClockOffset();

    const largest = Math.max(...rounds);
    db = new LoadTestDatabase(HOST_DATABASE_URL);
    const pairs = await db.seed(largest, secret);
    const links = loadLinks();
    say(`Seeded ${largest} senders and recipients. ${links.length} links in the pool.`);

    stats = streamStats((sample) => results.samples.push({ t: now(), ...sample }));
    health = startHealthProbe((sample) => results.health.push(sample), now);
    await sleep(3_000); // an idle baseline before the first burst

    let offset = 0;
    let saved: string[] = [];
    const sentBefore = new Set<string>();
    for (const [i, size] of rounds.entries()) {
      if (interrupted) {
        break;
      }
      say(`Round ${i + 1}/${rounds.length}: ${size} requests over ${WINDOW_MS / 1000} s…`);
      const roundLinks = pickLinks(links, offset, size);
      const round = await runRound(size, pairs, roundLinks, sentBefore, now);
      roundLinks.forEach((link) => sentBefore.add(link));
      offset += size;
      saved = [...saved, ...round.requests.flatMap((r) => (r.postId ? [r.postId] : []))];
      round.dbCheck = await db.check(saved.length, saved);
      round.container = await containerState();
      results.rounds.push(round);

      const s = summarizeRound(round, results.samples, results.health, []);
      // Server log lines are read only at the end, so this is not yet the round's verdict.
      const early = judgeRound(round, results.health, []);
      say(
        `  ${s.converted} converted, ${s.pending} pending, ${s.failed} failed; ` +
          `p95 ${((s.p95 ?? 0) / 1000).toFixed(1)} s, max ${((s.max ?? 0) / 1000).toFixed(1)} s; ` +
          `${early.passed ? 'no failures so far' : `failures: ${early.reasons.join('; ')}`} (final verdict in the report)`,
      );

      if (!round.container.running) {
        results.abortReason = 'the API container stopped';
        break;
      }
      if (i < rounds.length - 1 && !interrupted) {
        say('  Cooling down…');
        await coolDown();
      }
    }
    results.complete =
      !interrupted && !results.abortReason && results.rounds.length === rounds.length;
  } catch (error) {
    results.abortReason = (error as Error).message;
    say(`Stopped: ${(error as Error).message}`);
  } finally {
    stats?.kill();
    await health?.stop();
    if (containerStarted) {
      const parsed = parseServerLog(
        await serverLogs().catch(() => ''),
        runStartedAtMs + clockOffsetMs,
      );
      results.serverConversions = parsed.conversions;
      results.serverErrors = parsed.errors;
      await stopApi();
    }
    await db?.close().catch(() => undefined);
    if (databaseCreated) {
      await dropDatabase().catch((error: Error) =>
        say(`Could not drop the database: ${error.message}`),
      );
    }
    results.finishedAt = new Date().toISOString();

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(join(outDir, 'report.html'), renderReport(results));
  }

  const verdict = judgeRun(results);
  say(`\n${verdict.passed ? 'PASSED' : `FAILED: ${verdict.reasons.join('; ')}`}`);
  say(`Report: ${join(outDir, 'report.html')}`);
  process.exitCode = verdict.passed ? 0 : 1;
}

await main();
