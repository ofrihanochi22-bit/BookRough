import { expect, test, type Page } from '@playwright/test';

import {
  createCommunityAndReadLink,
  friendPage,
  joinThroughLink,
  openComposer,
} from '../support/flows';

/**
 * The notification center's golden loop — docs/features/notifications.md §7
 * (UC-21). The link is not in the scraper stand-in's fixtures, so it saves at
 * once as a pending post, with no title.
 */

const SHARED = 'https://open.spotify.com/track/7777777777777777777777';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');

test('a post reaches a member through the bell, and their rating reaches the author', async ({
  page,
  browser,
}) => {
  // Arrange — A runs a community, and B joins it.
  const link = await createCommunityAndReadLink(page, 'Notify Club');
  const friend = await friendPage(browser);
  await joinThroughLink(friend, link);

  // Act — A posts.
  const composer = await openComposer(page);
  await composer.getByLabel('Share a song or album').fill(SHARED);
  await composer.getByRole('button', { name: 'Post' }).click();
  await expect(postsOn(page).filter({ has: page.locator(`a[href="${SHARED}"]`) })).toBeVisible();

  // Assert — B's Home tab counts it; the bell opens it; the count clears.
  await nav(friend).getByRole('link', { name: /^Home/ }).click();
  await expect(nav(friend).getByRole('link', { name: 'Home, 1 unread' })).toBeVisible();
  await friend.getByRole('link', { name: 'Notifications, 1 unread' }).click();
  await friend.getByRole('link', { name: /posted in Notify Club/ }).click();
  await expect(friend.getByRole('heading', { name: 'Notify Club' })).toBeVisible();
  await expect(nav(friend).getByRole('link', { name: 'Home', exact: true })).toBeVisible();

  // Act — B saves the song and rates it 8 from My List.
  const card = postsOn(friend).filter({ has: friend.locator(`a[href="${SHARED}"]`) });
  await card.getByRole('button', { name: 'Save to Listen Later' }).click();
  await expect(friend.getByText('Added to Listen Later')).toBeVisible();
  await nav(friend).getByRole('link', { name: 'My List' }).click();
  await friend.getByRole('button', { name: /^Rate & Review/ }).click();
  const sheet = friend.getByRole('dialog', { name: 'Rate & Review' });
  await sheet.getByRole('radio', { name: '8' }).click();
  await sheet.getByRole('button', { name: 'Submit Rating' }).click();
  await expect(friend.getByText('Rating submitted')).toBeVisible();

  // Assert — A hears about it, with the score.
  await nav(page).getByRole('link', { name: /^Home/ }).click();
  await page.getByRole('link', { name: /^Notifications/ }).click();
  await expect(page.getByRole('link', { name: /rated your post 8\/10/ })).toBeVisible();

  await friend.context().close();
});
