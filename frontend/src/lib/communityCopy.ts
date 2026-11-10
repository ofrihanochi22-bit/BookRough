import type { PublicCommunity } from '../api/communities';

export function memberCountLabel(count: number): string {
  return count === 1 ? '1 member' : `${count} members`;
}

/** The member line on the community page, e.g. "3 members · You're an admin". */
export function membershipLine(community: PublicCommunity): string {
  const members = memberCountLabel(community.memberCount);
  if (community.myRole === 'OWNER') {
    return `${members} · You're the owner`;
  }
  return community.myRole === 'ADMIN' ? `${members} · You're an admin` : members;
}

/** Home's empty state, also shown by the Share sheet (ui-redesign.md §5.0b). */
export const NO_COMMUNITIES_TITLE = 'Start your first community';
export const NO_COMMUNITIES_BODY = 'A community is where your friends share music.';
export const COMMUNITIES_LOAD_FAILED = "Couldn't load your communities.";
export const CREATE_COMMUNITY_PATH = '/communities/new';

/**
 * Router state set by the Share sheet after posting (ui-redesign.md §5.0b): a
 * fresh value remounts the feed, so the new post is on top even when the feed
 * was already open.
 */
export interface SharedPostState {
  sharedAt: number;
}

export function sharedAt(state: unknown): number | undefined {
  const value = (state as Partial<SharedPostState> | null)?.sharedAt;
  return typeof value === 'number' ? value : undefined;
}
