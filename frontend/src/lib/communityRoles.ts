import type { CommunityRole } from '../api/communities';

/** The owner counts as an admin everywhere (docs/features/communities-membership.md §3.1). */
export function isAdmin(role: CommunityRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function roleLabel(role: CommunityRole): 'Owner' | 'Admin' | null {
  return role === 'OWNER' ? 'Owner' : role === 'ADMIN' ? 'Admin' : null;
}

export type MemberAction = 'makeAdmin' | 'makeMember' | 'remove' | 'makeOwner';

/**
 * What the caller may do to one member's row — mirrors the server's rules so
 * the screen offers only what will succeed (communities-membership.md §5.3):
 * admins promote and remove members and demote admins (themselves included);
 * the owner also hands over ownership; nobody acts on the owner.
 */
export function memberActions(
  caller: CommunityRole,
  target: CommunityRole,
  isSelf: boolean,
): MemberAction[] {
  if (!isAdmin(caller) || target === 'OWNER') {
    return [];
  }
  const actions: MemberAction[] = [];
  if (target === 'MEMBER' && !isSelf) {
    actions.push('makeAdmin', 'remove');
  }
  if (target === 'ADMIN') {
    actions.push('makeMember');
  }
  if (caller === 'OWNER' && !isSelf) {
    actions.push('makeOwner');
  }
  return actions;
}
