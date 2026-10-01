# Feature: Phase 1 E2E — sign-in through onboarding

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| **Use cases** | UC-1, UC-2, UC-3 (the golden loop through them)                                                      |
| **Phase**     | 1 — Step 1.7 of `DEVELOPMENT.md`                                                                     |
| **Branch**    | `chore/auth-flow-e2e` (DEVELOPMENT.md said `test/`, which is not an allowed prefix in CLAUDE.md §11) |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                                   |

---

## 1. Goal

A real browser, against the built frontend, the real API and a real Postgres, walks the Phase 1 golden loop: first sign-in → Complete Your Profile → home; sign out → Welcome; sign in again → straight to home. It runs on every push to `main` and nightly (`main.yml`), in desktop Chromium and in an iPhone-sized WebKit.

## 2. Scope

**In scope**

- A **Google stand-in** for tests only (decided 2026-10-01, option A):
  - **Browser side:** Playwright intercepts Google's sign-in script (`https://accounts.google.com/gsi/client`) and serves a small stub implementing the parts of `google.accounts.id` that `@react-oauth/google` calls. Its button hands back an ID token the test signed.
  - **Backend side:** an optional `E2E_GOOGLE_PUBLIC_KEY` setting. When present, ID tokens are verified with that RSA public key (RS256, `aud = GOOGLE_CLIENT_ID`, `iss = https://accounts.google.com`, expiry checked) instead of Google's keys. Everything after verification — find-or-create, the cookie, `toPublicUser`, the photo lifecycle — is the real code path.
- **Production guard:** the backend **refuses to start** when `E2E_GOOGLE_PUBLIC_KEY` is set and `NODE_ENV` is anything but `test`, and prints a warning to stderr at startup whenever the stand-in is active (the logger is silent under `NODE_ENV=test`). A unit test proves the refusal.
- A throwaway RSA key pair committed under `e2e/fixtures/` (test-only; worthless outside the stand-in, which production refuses).
- The golden-loop specs (§5) in `e2e/tests/`.
- `main.yml`: install WebKit as well as Chromium (the `mobile-safari` project exists but CI installs only Chromium today), pass the public key to the API.
- Local runs: Playwright's `webServer` builds and starts both apps against `music_app_test_db` when not in CI, so `npm test --prefix e2e` is one command.
- Docs: `docs/tests.md` (+ `.docx`) — how the stand-in works and why it is safe; `DEVELOPMENT.md`.

**Out of scope**

- Anything an integration test already proves (duplicate names, every validation message, 401/422 shapes). CLAUDE.md §10: golden loops only.
- Real Google in automation (option C, rejected), and a test-only login endpoint (option B, rejected).
- Running E2E on pull requests — stays on `main.yml` (CLAUDE.md §10).
- The installed-PWA popup risk from `google-auth.md` §8 — Phase 6.

## 3. Data model changes

None.

## 4. API / configuration

No new endpoints. One new optional environment variable:

| Variable                | Where   | Meaning                                                                                                                                                           |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_GOOGLE_PUBLIC_KEY` | backend | PEM public key. Present → stand-in verification. Allowed only with `NODE_ENV=test`; the env schema rejects it in every other mode, including an unset `NODE_ENV`. |

`.env.example` documents it as "leave empty". Stand-in rejections map to the same `401` "Google sign-in failed. Please try again." as real ones.

## 5. Test scenarios (the E2E specs)

Each test signs in as a fresh random `sub` and a unique display name, so tests never collide and no database wipe is needed between them.

- ✅ **First sign-in → onboarding → home:** Welcome shows → stand-in button → Complete Your Profile → type a free name, see "✓ Available", pick Apple Music, keep the generated avatar → Continue → home shows "Hi, <name>".
- ✅ **Session survives a reload, sign out, sign back in:** after onboarding, reload `/home` → still home; Sign out → Welcome; visiting `/home` now lands on Welcome; sign in again with the same `sub` → straight to home, no onboarding.
- ✅ **Abandoned onboarding resumes:** sign in, leave on Complete Your Profile, sign out; sign in again with the same `sub` → back on Complete Your Profile.

Supporting tests (unit/integration, not E2E):

- ❌ Env: `E2E_GOOGLE_PUBLIC_KEY` with `NODE_ENV` production, development, or unset → startup refused with a clear message.
- ✅ Stand-in verifier: a token signed with the fixture key → `{ sub, picture }`.
- ❌ Stand-in verifier: wrong key, wrong audience, wrong issuer, expired → `401`; key absent → the real Google path is used (existing tests).

## 6. Edge cases & failure modes

- **Stand-in left configured on a real server:** impossible — the env schema refuses to boot unless `NODE_ENV=test`, so a host that forgets `NODE_ENV` (default `development`) is refused too.
- **Google changes the GSI script API:** only the stub breaks, and only in E2E; the real app uses the real script. The stub is kept to the handful of calls `@react-oauth/google` makes, with a comment naming them.
- **Flakiness:** the debounced availability check and the network are awaited through visible text ("✓ Available"), never fixed sleeps. CI keeps `retries: 1` and traces on first retry.
- **Developer's dev database:** never touched — local runs use `music_app_test_db` like the integration suites.

## 7. Open questions

None.

## 8. Decisions log

| Date       | Decision                                                                      | Reason                                                                                                 |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2026-10-01 | Google stand-in: stubbed GSI script + backend public-key verifier             | Exercises the real Welcome flow and the real backend path; no session-minting endpoint                 |
| 2026-10-01 | Startup refusal in production                                                 | The stand-in must be impossible to enable on the real server, not merely discouraged                   |
| 2026-10-01 | Branch prefix `chore/`                                                        | `test/` is not in CLAUDE.md §11's list                                                                 |
| 2026-10-01 | CI installs WebKit                                                            | The `mobile-safari` project was configured but its browser was never installed                         |
| 2026-10-01 | Stand-in allowed only under `NODE_ENV=test` (was: refused only in production) | `/code-review`: an unset `NODE_ENV` defaults to development and would have slipped through             |
| 2026-10-01 | E2E TypeScript typecheck deferred                                             | Needs `typescript` + `@types/node` in the e2e package — a dependency change, left for its own approval |
