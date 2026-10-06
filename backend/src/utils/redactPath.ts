/**
 * Invite tokens travel in URL paths (/api/invites/<token>), and a token in a
 * log is a key to a community. Query strings carry people's names (a search,
 * a name check), and CLAUDE.md §4 keeps PII out of logs. Every path that
 * reaches a log goes through this first (docs/features/communities-invites.md
 * §4, docs/features/find-people.md §4).
 */
const INVITE_TOKEN = /(\/invites\/)[^/?#]+/g;
const QUERY = /\?.*$/s;

export function redactPath(path: string): string {
  return path.replace(QUERY, '?…').replace(INVITE_TOKEN, '$1:token');
}
