# E2E fixtures

`google-stand-in.key` / `google-stand-in.pub` are a **throwaway RSA key pair for the end-to-end suite only**. They are not a secret and are committed on purpose.

- The browser stub in `support/googleStandIn.ts` signs fake Google ID tokens with the private key.
- The API verifies them with the public key when started with `E2E_GOOGLE_PUBLIC_KEY`.
- The API **refuses to start** with `E2E_GOOGLE_PUBLIC_KEY` set unless `NODE_ENV=test`, so this key can never sign anyone into a real deployment.

If a secret scanner flags the private key, dismiss it as a test fixture — do not rotate or delete it without updating the suite. Full design: `docs/features/auth-flow-e2e.md`.

## `scraper-stand-in.json`

Canned link conversions that replace squigly.link in the E2E suite (`docs/features/posts-feed.md` §4.2). The API reads it when started with `E2E_SCRAPER_FIXTURES` (refused unless `NODE_ENV=test`).

- `conversions`: the result for each listed link. Any other link behaves like an outage, so the "Other services unavailable" path is testable.
- `delayMs`: long enough for the "Finding this track on other services…" state to be seen.
- `live`: links handed to the real converter. Only the nightly test (`RUN_LIVE_E2E=1`) sends one.
