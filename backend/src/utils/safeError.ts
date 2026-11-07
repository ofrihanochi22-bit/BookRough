import pino from 'pino';

const WITHHELD = 'Prisma error message withheld from the log';

/**
 * The Prisma errors whose message renders the query or its arguments. A
 * connection or engine error (PrismaClientInitializationError,
 * PrismaClientRustPanicError) carries no user data and is the main clue in an
 * outage, so it keeps its message.
 */
const WITHHELD_CLASSES = new Set([
  'PrismaClientKnownRequestError',
  'PrismaClientUnknownRequestError',
  'PrismaClientValidationError',
]);

function hasWithheldCause(err: Error): boolean {
  let cause: unknown = err.cause;
  for (let depth = 0; cause instanceof Error && depth < 10; depth += 1) {
    if (WITHHELD_CLASSES.has(cause.name)) {
      return true;
    }
    cause = cause.cause;
  }
  return false;
}

/**
 * The log's view of an error (docs/features/production-hardening.md §3.5).
 *
 * A Prisma request error's message renders the failed query, and a validation error
 * prints its arguments: a display name, a comment, a searched name. So for
 * those the message is dropped, and with it the stack's first line, which
 * repeats it. What is kept is enough to find the bug: the error's class, its
 * Prisma code, the model and field names, and the stack frames. Every other
 * error is logged as pino would log it.
 */
export function serializeError(err: unknown): unknown {
  if (!(err instanceof Error)) {
    return err;
  }
  if (!WITHHELD_CLASSES.has(err.name)) {
    // pino inlines every cause's message, so a withheld error wrapped as a
    // cause would leak through its wrapper: serialize the chain ourselves.
    return hasWithheldCause(err)
      ? { type: err.name, message: err.message, stack: err.stack, cause: serializeError(err.cause) }
      : pino.stdSerializers.err(err);
  }

  const { code, meta } = err as Error & { code?: unknown; meta?: unknown };
  const safe: Record<string, unknown> = {
    type: err.name,
    message: WITHHELD,
    stack: (err.stack ?? '')
      .split('\n')
      .filter((line) => line.trimStart().startsWith('at '))
      .join('\n'),
  };
  if (typeof code === 'string') {
    safe.code = code;
  }
  const kept = keptMeta(meta);
  if (kept) {
    safe.meta = kept;
  }
  return safe;
}

/** Names only: `meta` can also carry a cause in prose, or a value. */
function keptMeta(meta: unknown): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') {
    return undefined;
  }
  const { modelName, target } = meta as { modelName?: unknown; target?: unknown };
  const kept: Record<string, unknown> = {};
  if (typeof modelName === 'string') {
    kept.modelName = modelName;
  }
  if (Array.isArray(target) && target.every((name) => typeof name === 'string')) {
    kept.target = target;
  } else if (typeof target === 'string') {
    kept.target = target;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}
