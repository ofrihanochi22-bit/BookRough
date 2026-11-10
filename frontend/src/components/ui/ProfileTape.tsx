import type { ReactNode } from 'react';

import { avatarHue } from './avatarParts';
import { StripeBand } from './CommunityCover';
import { TAPE_PAPER } from './tape';

/**
 * A person's header under Mixtape (ui-redesign.md §5.6, §5.11): a `tape` paper
 * card with a stripe band in the user's own hue — the same hue as their
 * generated avatar — and the screen's content inside it.
 */
export function ProfileTape({
  userId,
  className = '',
  children,
}: {
  userId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid="profile-tape"
      className={`overflow-hidden rounded-[22px] ${TAPE_PAPER} ${className}`}
    >
      <StripeBand hue={avatarHue(userId)} className="h-4" />
      {/*
        Text and outlines on the paper: `ink`, `muted` and `line` follow the
        scheme and fade out on tape in dark mode, so inside the card they point
        at `tape-ink` (utilities read these variables directly — `@theme
        inline`). Everything nested — buttons, the Google spinner, helper
        lines — stays legible without a tape-only variant of each.
      */}
      <div className={`p-5 ${ON_TAPE}`}>{children}</div>
    </div>
  );
}

const ON_TAPE =
  '[--ink:var(--tape-ink)] [--line:var(--tape-ink)] [--muted:color-mix(in_srgb,var(--tape-ink)_75%,var(--tape))]';

/** The avatar's `tape-ink` ring on a profile's tape card. */
export const TAPE_AVATAR_RING = 'rounded-full ring-2 ring-tape-ink';
