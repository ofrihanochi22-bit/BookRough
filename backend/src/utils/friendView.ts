import { type MemberUser, toMemberUser } from './communityMember.js';

/** A friend, or a request to the viewer (docs/features/friend-requests.md §4). */
export interface FriendView {
  user: MemberUser;
  /** For a friend, when it was accepted; for a request, when it was sent. */
  since: string;
}

/** Field by field: the other person's three member fields and a date, nothing else. */
export function toFriendView(
  user: { id: string; displayName: string | null; profilePictureUrl: string | null },
  since: Date,
): FriendView {
  return { user: toMemberUser(user), since: since.toISOString() };
}
