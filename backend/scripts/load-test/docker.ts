/**
 * Everything the load test asks of Docker (docs/features/load-test.md §4.1,
 * §4.5): the compose Postgres, the load-test database, the API image and its
 * container, and the container's stats and logs.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

import {
  API_CONTAINER,
  API_PORT,
  CONTAINER_DATABASE_URL,
  CPU_LIMIT,
  DB_NAME,
  IMAGE,
  MEMORY_LIMIT,
  PG_CONTAINER,
  PG_USER,
} from './config.js';
import { parseStatsLine } from './parse.js';
import type { ContainerState } from './types.js';

const execFileAsync = promisify(execFile);

/** Runs a command and returns its stdout. Fails with its stderr. */
export async function run(command: string, args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(`${command} ${args[0] ?? ''} failed${stderr ? `: ${stderr}` : ''}`, {
      cause: error,
    });
  }
}

const docker = (args: string[], cwd?: string): Promise<string> => run('docker', args, cwd);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function assertDockerRunning(): Promise<void> {
  try {
    await docker(['info', '--format', '{{.ServerVersion}}']);
  } catch {
    throw new Error('Docker is not running. Start Docker Desktop and run the test again.');
  }
}

/** Starts the compose Postgres if it is down, and waits until it accepts connections. */
export async function ensurePostgres(repoRoot: string): Promise<void> {
  const running = await docker(['inspect', '-f', '{{.State.Running}}', PG_CONTAINER]).catch(
    () => 'false',
  );
  if (running !== 'true') {
    await docker(['compose', 'up', '-d', 'postgres'], repoRoot);
  }
  for (let i = 0; i < 30; i++) {
    const ready = await docker(['exec', PG_CONTAINER, 'pg_isready', '-U', PG_USER]).then(
      () => true,
      () => false,
    );
    if (ready) {
      return;
    }
    await sleep(1_000);
  }
  throw new Error(`${PG_CONTAINER} did not become ready.`);
}

const psql = (sql: string): Promise<string> =>
  docker([
    'exec',
    PG_CONTAINER,
    'psql',
    '-U',
    PG_USER,
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);

/** DB_NAME is a constant of this tool, never input, so it is safe in the SQL text. */
export async function recreateDatabase(): Promise<void> {
  await dropDatabase();
  await psql(`CREATE DATABASE ${DB_NAME} OWNER ${PG_USER}`);
}

export async function dropDatabase(): Promise<void> {
  await psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
}

export async function buildImage(backendDir: string): Promise<void> {
  await docker(['build', '-t', IMAGE, '.'], backendDir);
}

/**
 * The API as production runs it: the same image, NODE_ENV=production,
 * migrations on start, at a Hobby instance's size (load-test.md §2).
 */
export async function startApi(jwtSecret: string): Promise<void> {
  await stopApi();
  await docker([
    'run',
    '-d',
    '--name',
    API_CONTAINER,
    '--memory',
    MEMORY_LIMIT,
    '--memory-swap',
    MEMORY_LIMIT,
    '--cpus',
    CPU_LIMIT,
    '-p',
    `${API_PORT}:4000`,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-e',
    `DATABASE_URL=${CONTAINER_DATABASE_URL}`,
    '-e',
    `JWT_SECRET=${jwtSecret}`,
    '-e',
    'GOOGLE_CLIENT_ID=load-test.apps.googleusercontent.com',
    '-e',
    'CORS_ORIGIN=http://localhost:5173',
    '-e',
    'LOG_LEVEL=info',
    IMAGE,
  ]);
}

export async function stopApi(): Promise<void> {
  await docker(['rm', '-f', API_CONTAINER]).catch(() => undefined);
}

export async function containerState(): Promise<ContainerState> {
  const line = await docker([
    'inspect',
    '-f',
    '{{.State.Running}} {{.State.OOMKilled}} {{.RestartCount}}',
    API_CONTAINER,
  ]);
  const [running, oomKilled, restarts] = line.split(' ');
  return {
    running: running === 'true',
    oomKilled: oomKilled === 'true',
    restarts: Number(restarts),
  };
}

/** How many Chromium processes the container has (`docker top` needs no ps in the image). */
export async function chromiumCount(): Promise<number> {
  const top = await docker(['top', API_CONTAINER]).catch(() => '');
  return top.split('\n').filter((line) => /chrom/i.test(line)).length;
}

/** `docker stats`, streaming: one sample about every second until the process is killed. */
export function streamStats(
  onSample: (sample: { memoryMb: number; cpuPercent: number }) => void,
): ChildProcess {
  const child = spawn('docker', ['stats', '--format', '{{json .}}', API_CONTAINER], {
    windowsHide: true,
  });
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const sample = parseStatsLine(line);
      if (sample) {
        onSample(sample);
      }
    }
  });
  return child;
}

export async function serverLogs(): Promise<string> {
  const { stdout, stderr } = await execFileAsync('docker', ['logs', API_CONTAINER], {
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return `${stdout}\n${stderr}`;
}

export async function imageId(): Promise<string> {
  const id = await docker(['image', 'inspect', '-f', '{{.Id}}', IMAGE]);
  return `${IMAGE} (${id.replace('sha256:', '').slice(0, 12)})`;
}

/**
 * The container's clock minus this machine's, in ms. Docker Desktop's VM clock
 * can drift; read at the midpoint of the call so the exec's own delay cancels out.
 */
export async function containerClockOffset(): Promise<number> {
  const before = Date.now();
  const inside = Number(
    await docker(['exec', API_CONTAINER, 'node', '-e', 'process.stdout.write(String(Date.now()))']),
  );
  const after = Date.now();
  return Number.isFinite(inside) ? Math.round(inside - (before + after) / 2) : 0;
}

export async function nodeInContainer(): Promise<string> {
  return docker(['exec', API_CONTAINER, 'node', '--version']);
}
