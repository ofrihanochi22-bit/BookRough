/** The shape of results.json — docs/features/load-test.md §5. Times are ms since the run began. */

export type Outcome = 'converted' | 'pending' | 'failed';

export type FailureKind =
  | 'server_error' // 5xx
  | 'rate_limited' // 429
  | 'rejected' // any other non-201
  | 'network' // fetch threw: refused, reset, dropped
  | 'timeout' // no answer within CLIENT_TIMEOUT_MS
  | 'ceiling' // answered, but after CEILING_MS + margin
  | 'bad_body'; // 201 without a readable post

export interface RequestResult {
  round: number;
  index: number;
  url: string;
  /** This link was already sent in an earlier round: the pool is smaller than a full run. */
  repeatedLink: boolean;
  sentAt: number;
  answeredAt: number;
  latencyMs: number;
  status: number | null;
  outcome: Outcome;
  failure: FailureKind | null;
  detail: string | null;
  postId: string | null;
}

export interface DbCheck {
  /** Every 201 so far, all rounds. */
  expected: number;
  /** Rows in `posts`. More than expected means a post was saved for a failed request. */
  found: number;
  /** 201s whose post id has no row. */
  missing: number;
}

export interface ContainerState {
  running: boolean;
  oomKilled: boolean;
  restarts: number;
}

export interface RoundResult {
  size: number;
  startedAt: number;
  endedAt: number;
  requests: RequestResult[];
  dbCheck: DbCheck | null;
  container: ContainerState | null;
}

export interface StatSample {
  t: number;
  memoryMb: number;
  cpuPercent: number;
}

export interface HealthSample {
  t: number;
  latencyMs: number;
  ok: boolean;
}

/** A conversion as the server logged it (linkScraper.service.ts). */
export interface ServerConversion {
  t: number;
  outcome: 'converted' | 'not_found' | 'unavailable';
  reason: string | null;
  durationMs: number;
}

export interface ServerError {
  t: number;
  message: string;
}

export interface Environment {
  commit: string;
  image: string;
  memoryLimit: string;
  cpuLimit: string;
  hostCpus: number;
  hostMemoryGb: number;
  hostPlatform: string;
  nodeInContainer: string;
  playwright: string;
}

export interface RunResults {
  startedAt: string;
  finishedAt: string | null;
  complete: boolean;
  abortReason: string | null;
  plannedRounds: number[];
  environment: Environment | null;
  rounds: RoundResult[];
  samples: StatSample[];
  health: HealthSample[];
  serverConversions: ServerConversion[];
  serverErrors: ServerError[];
}
