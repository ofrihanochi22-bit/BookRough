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

/** The only request headers a log line may carry. */
const LOGGED_HEADERS = ['host', 'user-agent'] as const;

/**
 * The request logger's view of a request, built field by field: an invite
 * token or a searched name must not reach the log through the URL, nor through
 * pino-http's parsed `query` and `params` (docs/features/find-people.md §4).
 * Headers are an allowlist, not a denylist: behind a host's proxy they carry
 * the client's IP and location and the platform's own tokens
 * (docs/features/production-deploy.md §9), and a header added later must not
 * leak by default. The socket's remote address is dropped for the same reason.
 */
export function serializeRequest(req: Record<string, unknown>): Record<string, unknown> {
  const source = (req.headers ?? {}) as Record<string, unknown>;
  const headers: Record<string, unknown> = {};
  for (const name of LOGGED_HEADERS) {
    if (source[name] !== undefined) {
      headers[name] = source[name];
    }
  }
  return { id: req.id, method: req.method, url: redactPath(String(req.url)), headers };
}
