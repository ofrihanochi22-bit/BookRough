import type { User } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';

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
 * (`onboarding`: the walkthrough follows onboarding, never covers it) or when
 * TUTORIAL_ENABLED=false. The caller passes the onboarding state, so this
 * module does not import utils/publicUser, which imports it.
 */
export function tutorialState(user: User, onboarding: boolean): TutorialState {
  const show = enabled && !onboarding;
  return {
    walkthrough: show && user.walkthroughSeenAt === null,
    saveTip: show && user.saveTipSeenAt === null,
    listTip: show && user.listTipSeenAt === null,
  };
}

/**
 * Records that an item was seen and returns the caller's updated user. Only a
 * null column is written, so a second device closing the same walkthrough
 * keeps the first time; either way the column is set afterwards.
 */
export async function markTutorialSeen(user: User, item: TutorialItem): Promise<User> {
  const column = COLUMN[item];
  if (user[column] !== null) {
    return user;
  }
  const now = new Date();
  await prisma.user.updateMany({
    where: { id: user.id, [column]: null },
    data: { [column]: now },
  });
  return { ...user, [column]: now };
}
