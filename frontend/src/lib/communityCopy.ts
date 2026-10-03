import type { PublicCommunity } from '../api/communities';

export function memberCountLabel(count: number): string {
  return count === 1 ? '1 member' : `${count} members`;
}

/** The member line on the community page, e.g. "3 members · You're an admin". */
export function membershipLine(community: PublicCommunity): string {
  const members = memberCountLabel(community.memberCount);
  return community.myRole === 'ADMIN' ? `${members} · You’re an admin` : members;
}
