import type { NotificationType, Prisma } from '@prisma/client';

import { type MemberUser, memberUserSelect, toMemberUser } from './communityMember.js';

/** docs/features/notifications.md §4 — everything a client ever learns about a notification. */
export interface PublicNotification {
  id: string;
  type: NotificationType;
  /** The latest activity: a group's newest post, otherwise when it happened. */
  at: string;
  read: boolean;
  actor: MemberUser;
  community: { id: string; name: string } | null;
  post: { id: string; title: string | null } | null;
  /** Above 1 only for a COMMUNITY_POSTS group. */
  count: number;
  /** RATING: the rater's current score; null if their rating is gone. */
  score: number | null;
}

/** What Prisma must include for `toPublicNotification` — and nothing more. */
export const notificationInclude = {
  actor: { select: memberUserSelect },
  community: { select: { id: true, name: true } },
  post: { select: { id: true, songTitle: true } },
} as const satisfies Prisma.NotificationInclude;

type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>;

/**
 * Field by field (CLAUDE.md §5): the reader's id, timestamps other than the
 * activity time, and every other column stay on the server.
 */
export function toPublicNotification(
  row: NotificationRow,
  score: number | null,
): PublicNotification {
  return {
    id: row.id,
    type: row.type,
    at: row.updatedAt.toISOString(),
    read: row.readAt !== null,
    actor: toMemberUser(row.actor),
    community: row.community && { id: row.community.id, name: row.community.name },
    post: row.post && { id: row.post.id, title: row.post.songTitle },
    count: row.count,
    score: row.type === 'RATING' ? score : null,
  };
}
