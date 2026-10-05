import { expect, test, type Page } from '@playwright/test';

import { createCommunityAndReadLink, friendPage, joinThroughLink } from '../support/flows';

/**
 * Phase 3 golden loop — docs/features/posts-feed.md §7. squigly.link is the
 * scraper stand-in (fixtures/scraper-stand-in.json), except in the live test.
 */

const STAND_IN_TRACK = 'https://open.spotify.com/track/1111111111111111111111';
/** Not in the fixtures: the stand-in treats it as an outage. */
const OUTAGE_TRACK = 'https://open.spotify.com/track/2222222222222222222222';
/** Listed under `live`: the real converter handles it. */
const LIVE_TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

/** Post cards only: the community page itself is an article too. */
const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');

async function share(page: Page, url: string, comment?: string) {
  const composer = page.getByRole('form', { name: 'Share a song' });
  await composer.getByLabel('Share a song or album').fill(url);
  if (comment) {
    await composer.getByLabel(/Comment/).fill(comment);
  }
  await composer.getByRole('button', { name: 'Post' }).click();
}

test('a member shares a link; each friend opens it in their own service', async ({
  page,
  browser,
}) => {
  // Arrange — A (Apple Music) creates the community, B (Tidal) joins.
  const link = await createCommunityAndReadLink(page, 'Friday Jazz');
  await expect(page.getByText('Share the first song')).toBeVisible();
  const friend = await friendPage(browser);
  await joinThroughLink(friend, link, 'Tidal');

  // Act — A shares a Spotify link with a comment.
  await share(page, STAND_IN_TRACK, 'For Friday night');

  // Assert — the designed wait, then a complete post in A's service.
  await expect(
    page.getByRole('button', { name: 'Finding this track on other services…' }),
  ).toBeVisible();
  const card = postsOn(page).filter({ hasText: 'Stand-in Song' });
  await expect(card).toBeVisible();
  await expect(card.getByText('The Fixtures')).toBeVisible();
  await expect(card.getByText('For Friday night')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open in Apple Music' })).toHaveAttribute(
    'href',
    'https://music.apple.com/us/song/stand-in-song/1111111111',
  );

  // Assert — B sees the same post, opening in Tidal.
  await friend.reload();
  const friendCard = postsOn(friend).filter({ hasText: 'Stand-in Song' });
  await expect(friendCard.getByRole('link', { name: 'Open in Tidal' })).toHaveAttribute(
    'href',
    'https://tidal.com/browse/track/1111111111',
  );

  await friend.context().close();
});

test('when the converter is unavailable the post is saved with its original link', async ({
  page,
}) => {
  // Arrange
  await createCommunityAndReadLink(page, 'Sunday Vinyl');

  // Act
  await share(page, OUTAGE_TRACK);

  // Assert — no error dialog, no lost post.
  const card = postsOn(page).filter({ hasText: 'Shared from Spotify' });
  await expect(card.getByText('Other services unavailable')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
    'href',
    OUTAGE_TRACK,
  );
  await expect(card.getByRole('button', { name: 'Find on other services' })).toBeVisible();
});

test('live: the real squigly.link converts a known track', async ({ page }, testInfo) => {
  // Nightly only: the one test that depends on a live third-party site.
  test.skip(process.env.RUN_LIVE_E2E !== '1', 'Set RUN_LIVE_E2E=1 to drive the real squigly.link.');
  test.skip(testInfo.project.name !== 'chromium', 'One live call per run is enough.');

  // Arrange
  await createCommunityAndReadLink(page, 'Live Check');

  // Act
  await share(page, LIVE_TRACK);

  // Assert — if this fails while the rest pass, squigly.link changed its layout.
  const card = postsOn(page).filter({ hasText: 'Bohemian Rhapsody' });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole('link', { name: 'Open in Apple Music' })).toBeVisible();
});
