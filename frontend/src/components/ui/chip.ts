/**
 * The Mixtape chip (docs/features/ui-redesign.md §3.5): a quiet pill outlined
 * in `line`, at least 44px tall, for secondary actions beside the one accent
 * button — the post card's chips and the feed's Invite / Settings.
 */
export const CHIP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-line px-4 text-sm font-medium text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** The accent "Open in …" link pill of a Mixtape song card (ui-redesign.md §5.0, §5.9). */
export const OPEN_IN_PILL =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** The small rectangular kind label ("Album", "Video") beside a cover (§5.0). */
export const KIND_TAG = 'w-fit rounded-sm border border-line px-1.5 text-xs text-muted';
