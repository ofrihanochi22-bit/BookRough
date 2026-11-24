/**
 * The whole-request ceiling (CLAUDE.md §7, conversion-auto-retry.md §4.2): a
 * request that converts answers within CONVERSION_CEILING_MS of reaching its
 * controller, which sets the deadline as its first line.
 */

/** The whole request, from the controller's first line to the answer. */
export const CONVERSION_CEILING_MS = 12_000;

/**
 * Kept back from the deadline for the work after the conversion: the post's
 * write, notifications and the response (1.3 s measured under load).
 */
export const WRITE_RESERVE_MS = 1_500;

/** The request's deadline, an epoch time in ms. */
export function requestDeadline(startedAt: number = Date.now()): number {
  return startedAt + CONVERSION_CEILING_MS;
}

/**
 * The end of the work before the write: the converter and the metadata
 * fetches stop here, leaving WRITE_RESERVE_MS for the write and the answer.
 */
export function workEnd(deadline: number): number {
  return deadline - WRITE_RESERVE_MS;
}
