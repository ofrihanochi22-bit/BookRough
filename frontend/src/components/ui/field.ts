/**
 * The text-field look, by design. Current keeps today's classes exactly;
 * Mixtape (docs/features/ui-redesign.md §5.0c) is a `surface` field with a
 * 1.5px `line` border, radius 12px, the accent border and a visible ring on
 * focus, and a `danger` border on error (the message below stays the caller's).
 */
export function fieldClass(mixtape: boolean, invalid: boolean): string {
  if (mixtape) {
    return `w-full rounded-xl border-[1.5px] bg-surface px-4 text-base text-ink outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/35 read-only:opacity-60 ${
      invalid ? 'border-danger' : 'border-line'
    }`;
  }
  return `w-full rounded-xl border bg-surface px-4 text-base text-ink outline-none focus:border-accent read-only:opacity-60 ${
    invalid ? 'border-danger' : 'border-line'
  }`;
}
