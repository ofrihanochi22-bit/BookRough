/** Copy for community invitations — docs/features/invite-friends.md §5. */
export const INVITES_NOT_SENT =
  "Your community is ready, but the invitations weren't sent. Try again from Invite friends.";
export const INVITATION_GONE = 'This invitation is no longer available.';
export const MAX_SELECTED = 50;

export function joinedCommunity(name: string): string {
  return `You joined ${name}.`;
}

export function invitedBy(inviter: string | null, members: number): string {
  const count = `${members} ${members === 1 ? 'member' : 'members'}`;
  return inviter ? `${inviter} invited you · ${count}` : `You're invited · ${count}`;
}
