import { expect, test, type Page } from '@playwright/test';

import { createCommunityAndReadLink } from '../support/flows';

/**
 * The offline golden loop — docs/features/pwa-offline.md §7. Chromium only:
 * Playwright's service-worker support is Chromium-only, and this is the one
 * test that lets the worker run (playwright.config.ts blocks it elsewhere).
 */

const SHARED = 'https://open.spotify.com/track/7777777777777777777777';

test.use({ serviceWorkers: 'allow' });
test.skip(({ browserName }) => browserName !== 'chromium', 'Service workers are Chromium-only');

/**
 * Waits for the worker to activate. There is no clientsClaim, so it controls a
 * page only from the next load (docs/features/pwa-offline.md §3.1).
 */
async function waitForWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
}

test('with no connection the app opens signed in and reads what it last loaded', async ({
  page,
  context,
}) => {
  // Arrange — a community with a post, and a worker in charge of the page.
  await createCommunityAndReadLink(page, 'Offline Club');
  const composer = page.getByRole('form', { name: 'Share a song' });
  await composer.getByLabel('Share a song or album').fill(SHARED);
  await composer.getByRole('button', { name: 'Post' }).click();
  const post = page
    .getByRole('region', { name: 'Posts' })
    .getByRole('article')
    .filter({ has: page.locator(`a[href="${SHARED}"]`) });
  await expect(post).toBeVisible();
  await waitForWorker(page);

  // Load the two screens through the worker, so their answers are saved.
  await page.reload();
  await expect(post).toBeVisible();
  const community = page.url();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'My List' })
    .click();
  await expect(page.getByText('Nothing saved yet')).toBeVisible();

  // Act — the connection goes, and the app is opened again on the feed.
  await context.setOffline(true);
  await page.goto(community);

  // Assert — signed in, reading the saved feed, with writes blocked.
  await expect(post).toBeVisible();
  await expect(page.getByText("You're offline — showing what you last loaded.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();
  await expect(page.getByText("You're offline. Connect to post.")).toBeVisible();

  // Assert — My List is readable too, and a screen never loaded says so.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'My List' })
    .click();
  await expect(page.getByText('Nothing saved yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: /^Friends/ })
    .click();
  await expect(page.getByText("You're offline, and this wasn't loaded before.")).toBeVisible();

  // Act — the connection returns.
  await context.setOffline(false);

  // Assert — the session is confirmed, and writes come back.
  await expect(page.getByText("You're offline — showing what you last loaded.")).toBeHidden();
});
