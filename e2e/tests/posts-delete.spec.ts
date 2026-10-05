import { expect, test, type Page } from '@playwright/test';

import { createCommunityAndReadLink, friendPage, joinThroughLink } from '../support/flows';

/**
 * Phase 3 golden loop — docs/features/posts-delete.md §7. A member deletes
 * their own post; the owner deletes a member's post. Conversions come from the
 * scraper stand-in: these links are not in its fixtures, so they save as
 * pending posts at once, which is all this loop needs.
 */

const FIRST = 'https://open.spotify.com/track/3333333333333333333333';
const SECOND = 'https://open.spotify.com/track/4444444444444444444444';

const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');

async function share(page: Page, url: string) {
  const composer = page.getByRole('form', { name: 'Share a song' });
  await composer.getByLabel('Share a song or album').fill(url);
  await composer.getByRole('button', { name: 'Post' }).click();
  await expect(postsOn(page).filter({ has: page.locator(`a[href="${url}"]`) })).toBeVisible();
}

async function deleteFromMenu(page: Page, url: string, confirmation: string) {
  const card = postsOn(page).filter({ has: page.locator(`a[href="${url}"]`) });
  await card.getByRole('button', { name: 'Post options' }).click();
  await card.getByRole('button', { name: 'Delete post' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete post' });
  await expect(sheet).toContainText(confirmation);
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Post deleted')).toBeVisible();
  await expect(card).toHaveCount(0);
}

test('a member deletes their own post; the owner deletes a member’s post', async ({
  page,
  browser,
}) => {
  // Arrange — A owns the community; B joins and shares two links.
  const link = await createCommunityAndReadLink(page, 'Friday Jazz');
  const friend = await friendPage(browser);
  const friendName = await joinThroughLink(friend, link);
  await share(friend, FIRST);
  await share(friend, SECOND);

  // Act — B deletes their first post (UC-18's confirmation).
  await deleteFromMenu(friend, FIRST, 'Are you sure you want to delete this recommendation?');

  // Assert — gone for A too.
  await page.reload();
  await expect(postsOn(page)).toHaveCount(1);

  // Act — A (owner) deletes B's second post, with the admin wording.
  await deleteFromMenu(page, SECOND, `Delete ${friendName}'s recommendation?`);

  // Assert — gone for B as well.
  await friend.reload();
  await expect(friend.getByText('Share the first song')).toBeVisible();

  await friend.context().close();
});
