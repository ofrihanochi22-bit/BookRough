/**
 * Reads what Docker prints: `docker stats` lines and the API's Pino log lines.
 * Pure, so it is unit-tested against captured output.
 */
import type { ServerConversion, ServerError } from './types.js';

const UNIT_MB: Record<string, number> = {
  B: 1 / (1024 * 1024),
  KiB: 1 / 1024,
  KB: 1 / 1000,
  MiB: 1,
  MB: 1,
  GiB: 1024,
  GB: 1000,
};

/** "327.4MiB" → 327.4. Null for anything else. */
export function parseMemoryMb(text: string): number | null {
  const match = /^([\d.]+)\s*([KMG]i?B|B)$/.exec(text.trim());
  const factor = match ? UNIT_MB[match[2] ?? ''] : undefined;
  if (!match || factor === undefined) {
    return null;
  }
  return Number(match[1]) * factor;
}

// The streaming form of `docker stats` redraws the screen with ANSI codes.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** One `docker stats --format "{{json .}}"` line → memory and CPU, or null. */
export function parseStatsLine(line: string): { memoryMb: number; cpuPercent: number } | null {
  const clean = line.replace(ANSI, '').trim();
  const start = clean.indexOf('{');
  if (start === -1) {
    return null;
  }
  try {
    const row = JSON.parse(clean.slice(start)) as { MemUsage?: unknown; CPUPerc?: unknown };
    if (typeof row.MemUsage !== 'string' || typeof row.CPUPerc !== 'string') {
      return null;
    }
    const memoryMb = parseMemoryMb(row.MemUsage.split('/')[0] ?? '');
    const cpuPercent = Number(row.CPUPerc.replace('%', ''));
    if (memoryMb === null || !Number.isFinite(cpuPercent)) {
      return null;
    }
    return { memoryMb, cpuPercent };
  } catch {
    return null;
  }
}

const CONVERSION_MESSAGES: Record<string, ServerConversion['outcome']> = {
  'Link converted': 'converted',
  'Link not found': 'not_found',
  'Link conversion unavailable': 'unavailable',
};

/** Pino's error level and above (50 error, 60 fatal). */
const ERROR_LEVEL = 50;

/**
 * The API's stdout → its conversions and its error lines, timed against the
 * run's start. Lines that are not Pino JSON (npm, Prisma's CLI) are skipped.
 */
export function parseServerLog(
  text: string,
  runStartedAtMs: number,
): { conversions: ServerConversion[]; errors: ServerError[] } {
  const conversions: ServerConversion[] = [];
  const errors: ServerError[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('{')) {
      continue;
    }
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const time = typeof entry.time === 'string' ? Date.parse(entry.time) : NaN;
    if (!Number.isFinite(time) || time < runStartedAtMs) {
      continue;
    }
    const t = time - runStartedAtMs;
    const msg = typeof entry.msg === 'string' ? entry.msg : '';

    const outcome = CONVERSION_MESSAGES[msg];
    if (outcome && typeof entry.durationMs === 'number') {
      conversions.push({
        t,
        outcome,
        reason: typeof entry.reason === 'string' ? entry.reason : null,
        durationMs: entry.durationMs,
      });
    }
    if (typeof entry.level === 'number' && entry.level >= ERROR_LEVEL) {
      errors.push({ t, message: msg || 'error' });
    }
  }
  return { conversions, errors };
}
