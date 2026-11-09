import type { Prisma } from '@prisma/client';

import { type MemberUser, memberUserSelect, toMemberUser } from './communityMember.js';

/** docs/features/discussion-threads.md §4 — everything a client learns about a comment. */
export interface PublicComment {
  id: string;
  author: MemberUser;
  /** Null once deleted with its replies kept ("Comment deleted"). */
  body: string | null;
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  /** A reply under this review. */
  ratingId: string | null;
  /** A reply in this post comment's thread. */
  parentId: string | null;
  replyTo: MemberUser | null;
  isMine: boolean;
  /** The author, or an admin or owner of the post's community. */
  canDelete: boolean;
}

/** What Prisma must include for `toPublicComment` — and nothing more. */
export const commentInclude = {
  author: { select: memberUserSelect },
  replyTo: { select: memberUserSelect },
} as const satisfies Prisma.CommentInclude;

export type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

/** Field by field (CLAUDE.md §5): the post id and the deletion time stay on the server. */
export function toPublicComment(
  row: CommentRow,
  viewerId: string,
  viewerModerates: boolean,
): PublicComment {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    author: toMemberUser(row.author),
    body: deleted ? null : row.body,
    deleted,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    ratingId: row.ratingId,
    parentId: row.parentId,
    replyTo: row.replyTo && toMemberUser(row.replyTo),
    isMine: row.authorId === viewerId,
    canDelete: !deleted && (row.authorId === viewerId || viewerModerates),
  };
}
