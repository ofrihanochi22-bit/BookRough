import { Prisma, type Friend, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { memberUserSelect } from '../utils/communityMember.js';
import { type FriendView, toFriendView } from '../utils/friendView.js';
import { createLogger } from '../utils/logger.js';
import { notifyFriendAccepted, notifyFriendRequest } from './friendNotification.js';
import { findProfileUser, requireOnboarded } from './profile.service.js';

const log = createLogger('friend.service');

/** The viewer's relation to another user — never anyone else's (friend-requests.md §4). */
export type Friendship = 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIENDS';

export const SELF_REQUEST = "You can't add yourself.";
export const SENDER_GONE = 'This request is no longer valid as the user account does not exist.';
export const REQUEST_GONE = 'This request is no longer available.';

type Pair = Pick<Friend, 'requesterId' | 'addresseeId' | 'status'>;
type Client = Prisma.TransactionClient | typeof prisma;

/** The one row between two users, in whichever direction it was sent. */
function findPair(client: Client, a: string, b: string): Promise<Pair | null> {
  return client.friend.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
    select: { requesterId: true, addresseeId: true, status: true },
  });
}

function relation(row: Pair | null, viewerId: string): Friendship {
  if (!row) {
    return 'NONE';
  }
  if (row.status === 'ACCEPTED') {
    return 'FRIENDS';
  }
  return row.requesterId === viewerId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
}

/** The viewer's relation to `targetId`; `NONE` for themselves. */
export async function friendshipOf(viewerId: string, targetId: string): Promise<Friendship> {
  if (viewerId === targetId) {
    return 'NONE';
  }
  return relation(await findPair(prisma, viewerId, targetId), viewerId);
}

type SendResult = 'sent' | 'accepted-mutual' | 'unchanged';

/** One attempt at sending, in a transaction; a racing insert surfaces as P2002. */
function attemptSend(userId: string, targetId: string): Promise<SendResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await findPair(tx, userId, targetId);
    if (!existing) {
      await tx.friend.create({ data: { requesterId: userId, addresseeId: targetId } });
      return 'sent';
    }
    if (existing.status === 'ACCEPTED' || existing.requesterId === userId) {
      return 'unchanged';
    }
    // They asked first: sending back is accepting (§6). If they withdrew it
    // meanwhile, there is nothing to accept, and this becomes a plain request.
    const { count } = await tx.friend.updateMany({
      where: { requesterId: targetId, addresseeId: userId, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    if (count === 0) {
      await tx.friend.create({ data: { requesterId: userId, addresseeId: targetId } });
      return 'sent';
    }
    return 'accepted-mutual';
  });
}

/** Notifications run after the write commits and never fail it (§4.4). */
function notifySafely(send: () => void, event: string): void {
  try {
    send();
  } catch (error) {
    log.warn({ err: error, event }, 'Friend notification failed');
  }
}

/**
 * POST /friends/requests — UC-6. Idempotent; a request to someone who already
 * asked the caller accepts theirs. Two opposite requests racing hit the pair
 * index (P2002); the retry then sees the other row and accepts it.
 */
export async function sendRequest(user: User, targetId: string): Promise<Friendship> {
  requireOnboarded(user);
  if (targetId === user.id) {
    throw new AppError(SELF_REQUEST, 422);
  }
  await findProfileUser(targetId);

  let result: SendResult;
  try {
    result = await attemptSend(user.id, targetId);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
    result = await attemptSend(user.id, targetId);
  }

  log.info({ userId: user.id, targetId, result }, 'Friend request sent');
  if (result === 'sent') {
    notifySafely(
      () => notifyFriendRequest({ requesterId: user.id, addresseeId: targetId }),
      'request',
    );
  } else if (result === 'accepted-mutual') {
    notifySafely(
      () => notifyFriendAccepted({ requesterId: targetId, addresseeId: user.id }),
      'accepted',
    );
  }
  return friendshipOf(user.id, targetId);
}

/** DELETE /friends/requests/sent/:userId — withdraw your own pending request. Idempotent. */
export async function cancelRequest(user: User, targetId: string): Promise<Friendship> {
  requireOnboarded(user);
  await findProfileUser(targetId);
  const { count } = await prisma.friend.deleteMany({
    where: { requesterId: user.id, addresseeId: targetId, status: 'PENDING' },
  });
  if (count > 0) {
    log.info({ userId: user.id, targetId }, 'Friend request cancelled');
  }
  return friendshipOf(user.id, targetId);
}

/**
 * POST /friends/requests/:userId/accept — UC-7. A sender who no longer exists
 * gets UC-7's message; a request that is gone (cancelled, ignored, accepted
 * elsewhere) gets its own.
 */
export async function acceptRequest(user: User, requesterId: string): Promise<FriendView> {
  requireOnboarded(user);
  const sender = await findProfileUser(requesterId, SENDER_GONE);
  const { count } = await prisma.friend.updateMany({
    where: { requesterId, addresseeId: user.id, status: 'PENDING' },
    data: { status: 'ACCEPTED' },
  });
  if (count === 0) {
    throw new AppError(REQUEST_GONE, 404);
  }
  log.info({ userId: user.id, requesterId }, 'Friend request accepted');
  notifySafely(() => notifyFriendAccepted({ requesterId, addresseeId: user.id }), 'accepted');
  const accepted = await prisma.friend.findUnique({
    where: { requesterId_addresseeId: { requesterId, addresseeId: user.id } },
    select: { updatedAt: true },
  });
  return toFriendView(sender, accepted?.updatedAt ?? new Date());
}

/** POST /friends/requests/:userId/ignore — UC-7: the request is deleted. Idempotent. */
export async function ignoreRequest(user: User, requesterId: string): Promise<void> {
  requireOnboarded(user);
  const { count } = await prisma.friend.deleteMany({
    where: { requesterId, addresseeId: user.id, status: 'PENDING' },
  });
  if (count > 0) {
    log.info({ userId: user.id, requesterId }, 'Friend request ignored');
  }
}

const otherUserSelect = { ...memberUserSelect, displayNameKey: true } as const;

/** GET /friends — every accepted friendship, either direction, alphabetical. */
export async function listFriends(user: User): Promise<FriendView[]> {
  requireOnboarded(user);
  const rows = await prisma.friend.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
    select: {
      requesterId: true,
      updatedAt: true,
      requester: { select: otherUserSelect },
      addressee: { select: otherUserSelect },
    },
  });
  return rows
    .map((row) => ({
      other: row.requesterId === user.id ? row.addressee : row.requester,
      since: row.updatedAt,
    }))
    .sort((a, b) => (a.other.displayNameKey ?? '').localeCompare(b.other.displayNameKey ?? ''))
    .map(({ other, since }) => toFriendView(other, since));
}

/** GET /friends/requests — pending requests to the caller, newest first. */
export async function listRequests(user: User): Promise<FriendView[]> {
  requireOnboarded(user);
  const rows = await prisma.friend.findMany({
    where: { addresseeId: user.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, requester: { select: memberUserSelect } },
  });
  return rows.map((row) => toFriendView(row.requester, row.createdAt));
}

/** GET /friends/requests/count — the Friends tab's badge. */
export async function countRequests(user: User): Promise<number> {
  requireOnboarded(user);
  return prisma.friend.count({ where: { addresseeId: user.id, status: 'PENDING' } });
}
