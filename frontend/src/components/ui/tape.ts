/**
 * Tape paper (docs/features/ui-redesign.md §3.1): the `tape` fill with
 * `tape-ink` text. In light mode a 1px `line` ring keeps it visible on a white
 * `surface`, where tape alone is about 1.03:1 (slice 1 accessibility review,
 * approved 2026-11-10). Dark mode needs none.
 */
export const TAPE_PAPER = 'bg-tape text-tape-ink ring-1 ring-line ring-inset dark:ring-0';
