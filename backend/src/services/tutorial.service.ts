import type { User } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { needsOnboarding } from '../utils/publicUser.js';

/**
 * The onboarding tutorial's seen state — docs/features/onboarding-tutorial.md.
 * Three items, each shown once per account: the walkthrough and two tips.
 */
export const TUTORIAL_ITEMS = ['walkthrough', 'saveTip', 'listTip'] as const;
export type TutorialItem = (typeof TUTORIAL_ITEMS)[number];

/** `true` = still to show. Sent only to the caller, in the session payload. */
export type TutorialState = Record<TutorialItem, boolean>;

const COLUMN = {
  walkthrough: 'walkthroughSeenAt',
  saveTip: 'saveTipSeenAt',
  listTip: 'listTipSeenAt',
} as const satisfies Record<TutorialItem, keyof User>;

let enabled = env.TUTORIAL_ENABLED;

/** Tests only: the environment switch is read once at start-up. */
export function setTutorialEnabled(value: boolean): void {
  enabled = value;
}

/**
 * What the client should still show. Nothing while the profile is unfinished
 * (the walkthrough follows onboarding, never covers it) or when
 * TUTORIAL_ENABLED=false.
 */
export function tutorialState(user: User): TutorialState {
  const show = enabled && !needsOnboarding(user);
  return {
    walkthrough: show && user.walkthroughSeenAt === null,
    saveTip: show && user.saveTipSeenAt === null,
    listTip: show && user.listTipSeenAt === null,
  };
}

/**
 * Records that an item was seen. Only a null column is written, so a second
 * device closing the same walkthrough keeps the first time.
 */
export async function markTutorialSeen(user: User, item: TutorialItem): Promise<TutorialState> {
  if (!TUTORIAL_ITEMS.includes(item)) {
    throw new AppError('Unknown tutorial item.', 422);
  }
  const column = COLUMN[item];
  if (user[column] !== null) {
    return tutorialState(user);
  }
  await prisma.user.updateMany({
    where: { id: user.id, [column]: null },
    data: { [column]: new Date() },
  });
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) {
    throw new AppError('User not found.', 404);
  }
  return tutorialState(fresh);
}
