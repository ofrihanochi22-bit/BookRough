# E2E fixtures

`google-stand-in.key` / `google-stand-in.pub` are a **throwaway RSA key pair for the end-to-end suite only**. They are not a secret and are committed on purpose.

- The browser stub in `support/googleStandIn.ts` signs fake Google ID tokens with the private key.
- The API verifies them with the public key when started with `E2E_GOOGLE_PUBLIC_KEY`.
- The API **refuses to start** with `E2E_GOOGLE_PUBLIC_KEY` set unless `NODE_ENV=test`, so this key can never sign anyone into a real deployment.

If a secret scanner flags the private key, dismiss it as a test fixture — do not rotate or delete it without updating the suite. Full design: `docs/features/auth-flow-e2e.md`.
