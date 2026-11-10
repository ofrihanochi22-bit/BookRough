import { type Friend, Prisma } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { NO_FRIENDS } from '../utils/publicPost.js';

/** The viewer's relation to another user — never anyone else's (friend-requests.md §4). */
export type Friendship = 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIENDS';

/** The fields of a `friends` row that decide a relation. */
export type Pair = Pick<Friend, 'requesterId' | 'addresseeId' | 'status'>;

/** The one row between the viewer and someone, read from the viewer's side. */
export function relation(row: Pair | null, viewerId: string): Friendship {
  if (!row) {
    return 'NONE';
  }
  if (row.status === 'ACCEPTED') {
    return 'FRIENDS';
  }
  return row.requesterId === viewerId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
}

/**
 * The viewer's relation to each of these people, in one query
 * (search-friend-button.md §4). Someone with no row is absent: `NONE`.
 * An empty list runs no query.
 */
export async function friendshipsWith(
  viewerId: string,
  ids: readonly string[],
): Promise<Map<string, Friendship>> {
  const others = ids.filter((id) => id !== viewerId);
  if (others.length === 0) {
    return new Map();
  }
  const rows = await prisma.friend.findMany({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: { in: others } },
        { addresseeId: viewerId, requesterId: { in: others } },
      ],
    },
    select: { requesterId: true, addresseeId: true, status: true },
  });
  return new Map(
    rows.map((row) => [
      row.requesterId === viewerId ? row.addresseeId : row.requesterId,
      relation(row, viewerId),
    ]),
  );
}

/** True when an accepted friendship exists, in whichever direction it was sent. */
export async function areFriends(a: string, b: string): Promise<boolean> {
  const count = await prisma.friend.count({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
  return count > 0;
}

/**
 * True when the two are friends. FOR SHARE holds the row until the transaction
 * commits, so an unfriend running now waits for the insert it guards
 * (CLAUDE.md §4: not expressible in Prisma).
 */
export async function lockFriendship(
  tx: Prisma.TransactionClient,
  a: string,
  b: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<unknown[]>(Prisma.sql`
    SELECT 1 FROM friends
    WHERE status = 'ACCEPTED'
      AND ((requester_id = ${a}::uuid AND addressee_id = ${b}::uuid)
        OR (requester_id = ${b}::uuid AND addressee_id = ${a}::uuid))
    FOR SHARE`);
  return rows.length > 0;
}

/**
 * Which of the other people on these direct items the viewer is friends with
 * now: one query for a page. A page with no direct item runs none.
 */
export async function friendsOnPosts(
  viewerId: string,
  posts: ReadonlyArray<{ authorId: string; recipientId: string | null }>,
): Promise<ReadonlySet<string>> {
  const others = posts.flatMap((post) =>
    post.recipientId ? [post.authorId === viewerId ? post.recipientId : post.authorId] : [],
  );
  if (others.length === 0) {
    return NO_FRIENDS;
  }
  const rows = await prisma.friend.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: viewerId, addresseeId: { in: others } },
        { addresseeId: viewerId, requesterId: { in: others } },
      ],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return new Set(
    rows.map((row) => (row.requesterId === viewerId ? row.addresseeId : row.requesterId)),
  );
}
