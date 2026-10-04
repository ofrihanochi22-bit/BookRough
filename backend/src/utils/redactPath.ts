/**
 * Invite tokens travel in URL paths (/api/invites/<token>), and a token in a
 * log is a key to a community. Every path that reaches a log goes through
 * this first (docs/features/communities-invites.md §4).
 */
const INVITE_TOKEN = /(\/invites\/)[^/?#]+/g;

export function redactPath(path: string): string {
  return path.replace(INVITE_TOKEN, '$1:token');
}
