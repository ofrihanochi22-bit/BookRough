import { expect, test, type Page } from '@playwright/test';

import { createCommunityAndReadLink, friendPage, joinThroughLink } from '../support/flows';

/**
 * Phase 4 golden loop, the "rate" step — docs/features/rate-post.md §7. The
 * link is not in the scraper stand-in's fixtures, so it saves at once as a
 * pending post.
 */

const SHARED = 'https://open.spotify.com/track/6666666666666666666666';

const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');

test('a friend rates a saved song from My List, and the feed shows their score', async ({
  page,
  browser,
}) => {
  // Arrange — A shares a link; B joins and saves it.
  const link = await createCommunityAndReadLink(page, 'Rating Club');
  const composer = page.getByRole('form', { name: 'Share a song' });
  await composer.getByLabel('Share a song or album').fill(SHARED);
  await composer.getByRole('button', { name: 'Post' }).click();
  await expect(postsOn(page).filter({ has: page.locator(`a[href="${SHARED}"]`) })).toBeVisible();
  const friend = await friendPage(browser);
  await joinThroughLink(friend, link);
  const card = postsOn(friend).filter({ has: friend.locator(`a[href="${SHARED}"]`) });
  await card.getByRole('button', { name: 'Save to Listen Later' }).click();
  await expect(friend.getByText('Added to Listen Later')).toBeVisible();

  // Act — B rates it 8 from My List.
  await friend
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'My List' })
    .click();
  await friend.getByRole('button', { name: /^Rate & Review/ }).click();
  const sheet = friend.getByRole('dialog', { name: 'Rate & Review' });
  await sheet.getByRole('radio', { name: '8' }).click();
  await sheet.getByLabel(/Comment/).fill('Still sounds fresh');
  await sheet.getByRole('button', { name: 'Submit Rating' }).click();

  // Assert — rated, and off the list.
  await expect(friend.getByText('Rating submitted')).toBeVisible();
  await expect(friend.getByText('Nothing saved yet')).toBeVisible();

  // Assert — the feed shows B's score instead of the bookmark.
  await friend.goBack();
  await friend.reload();
  await expect(card.getByText('You rated 8/10')).toBeVisible();
  await expect(card.getByRole('button', { name: /Listen Later/ })).toHaveCount(0);

  await friend.context().close();
});
