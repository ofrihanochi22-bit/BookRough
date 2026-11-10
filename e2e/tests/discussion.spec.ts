import { expect, test, type Page } from '@playwright/test';

import {
  createCommunityAndReadLink,
  friendPage,
  joinThroughLink,
  openComposer,
} from '../support/flows';

/**
 * The discussion's golden loop — docs/features/discussion-threads.md §7
 * (UC-22). The link is not in the scraper stand-in's fixtures, so it saves at
 * once as a pending post, with no title.
 */

const SHARED = 'https://open.spotify.com/track/8888888888888888888888';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');
const discussion = (page: Page) => page.getByRole('region', { name: 'Discussion' });

test('a comment reaches the author through the bell, and their reply joins the thread', async ({
  page,
  browser,
}) => {
  // Arrange — A runs a community and posts; B joins it.
  const link = await createCommunityAndReadLink(page, 'Talk Club');
  const friend = await friendPage(browser);
  await joinThroughLink(friend, link);
  const composer = await openComposer(page);
  await composer.getByLabel('Share a song or album').fill(SHARED);
  await composer.getByRole('button', { name: 'Post' }).click();
  await expect(postsOn(page).filter({ has: page.locator(`a[href="${SHARED}"]`) })).toBeVisible();

  // Act — B opens the post and comments.
  await friend.reload();
  const card = postsOn(friend).filter({ has: friend.locator(`a[href="${SHARED}"]`) });
  await card.getByRole('link', { name: 'Comments' }).click();
  await discussion(friend).getByLabel('Add a comment').fill('Where did you find this?');
  await discussion(friend).getByRole('button', { name: 'Send' }).click();
  await expect(discussion(friend).getByText('Where did you find this?')).toBeVisible();

  // Assert — A hears about it through the bell, which opens the post.
  await nav(page).getByRole('link', { name: /^Home/ }).click();
  await page.getByRole('link', { name: /^Notifications/ }).click();
  await page.getByRole('link', { name: /replied to you on your post/ }).click();
  await expect(discussion(page).getByText('Where did you find this?')).toBeVisible();

  // Act — A replies in the thread.
  await discussion(page).getByRole('button', { name: 'Reply' }).click();
  await discussion(page).getByLabel('Your reply').fill('A friend sent it to me');
  await discussion(page)
    .locator('form')
    .filter({ has: page.getByLabel('Your reply') })
    .getByRole('button', { name: 'Send' })
    .click();

  // Assert — the reply is in the thread, and on B's screen after a reload.
  await expect(discussion(page).getByText('A friend sent it to me')).toBeVisible();
  await friend.reload();
  await expect(discussion(friend).getByText('A friend sent it to me')).toBeVisible();

  await friend.context().close();
});
