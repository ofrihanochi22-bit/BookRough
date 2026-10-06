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

/**
 * The request logger's view of a request: an invite token or a searched name
 * must not reach the log through the URL, nor through pino-http's parsed
 * `query` and `params` (docs/features/find-people.md §4).
 */
export function serializeRequest({
  query: _query,
  params: _params,
  ...req
}: Record<string, unknown>): Record<string, unknown> {
  return { ...req, url: redactPath(String(req.url)) };
}
