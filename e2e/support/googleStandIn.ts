import { createSign, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

/**
 * The Google stand-in, browser half (docs/features/auth-flow-e2e.md §2).
 *
 * The backend half is `E2E_GOOGLE_PUBLIC_KEY`: given the public key that pairs
 * with ../fixtures/google-stand-in.key, the API verifies these tokens exactly as
 * it would Google's. The key pair is throwaway — the API refuses to start with
 * the stand-in enabled unless NODE_ENV=test.
 */

const PRIVATE_KEY = readFileSync(
  fileURLToPath(new URL('../fixtures/google-stand-in.key', import.meta.url)),
  'utf8',
);
const PLACEHOLDER_PICTURE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="#888"/></svg>',
  );
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID ?? 'e2e-client-id.apps.googleusercontent.com';

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/** A Google-shaped ID token, RS256-signed with the stand-in key. */
export function signIdToken(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub,
      // Present so the run would expose any code path that kept them.
      email: `${sub}@example.test`,
      name: 'E2E Person',
      // A data URL, so rendering the 'Google photo' option never reaches the network.
      picture: PLACEHOLDER_PICTURE,
      iat: now,
      exp: now + 600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${base64url(signer.sign(PRIVATE_KEY))}`;
}

/** A fresh account identity per test, so tests never share rows. */
export function newGoogleAccount(): { sub: string; displayName: string } {
  const id = randomUUID().replace(/-/g, '');
  return { sub: `e2e-${id}`, displayName: `E2E ${id.slice(0, 8)}` };
}

/**
 * Replaces Google's sign-in script with a stub. It implements only what
 * `@react-oauth/google` calls — `initialize`, `renderButton`, `prompt`,
 * `cancel`, `disableAutoSelect` — and its button answers with a token for
 * `sub`. Call it again to sign in as someone else.
 */
export async function stubGoogle(page: Page, sub: string): Promise<void> {
  const credential = signIdToken(sub);
  const script = `
    (() => {
      let callback = null;
      window.google = { accounts: { id: {
        initialize(config) { callback = config.callback; },
        renderButton(container) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Continue with Google';
          button.onclick = () => callback && callback({ credential: ${JSON.stringify(credential)}, select_by: 'btn' });
          container.replaceChildren(button);
        },
        prompt() {}, cancel() {}, disableAutoSelect() {},
      } } };
    })();
  `;
  await page.unroute('https://accounts.google.com/gsi/client*');
  await page.route('https://accounts.google.com/gsi/client*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: script }),
  );
}
