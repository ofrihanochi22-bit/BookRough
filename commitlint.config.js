/**
 * Enforces Conventional Commits (CLAUDE.md §11) through the commit-msg hook,
 * so the convention is guaranteed by tooling rather than remembered.
 *
 * Bypassing this with --no-verify is not permitted. A rejected message is fixed
 * by rewriting the message.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The scope is the area touched — auth, scraper, communities — and stays
    // lowercase. Optional: `chore: …` with no scope is valid.
    'scope-case': [2, 'always', 'lower-case'],
    // Long bodies are welcome; the subject line stays readable in `git log --oneline`.
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [0],
  },
};
