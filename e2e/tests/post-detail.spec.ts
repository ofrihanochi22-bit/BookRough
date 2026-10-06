import { expect, test, type Page } from '@playwright/test';

import { createCommunityAndReadLink, friendPage, joinThroughLink } from '../support/flows';

/**
 * Phase 4 golden loop, the "see the feedback" step — docs/features/post-detail.md
 * §7. The link is not in the scraper stand-in's fixtures, so it saves at once
 * as a pending post.
 */

const SHARED = 'https://open.spotify.com/track/7777777777777777777777';

const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');

test('the author sees a friend’s rating in Post Detail, and the friend edits it', async ({
  page,
  browser,
}) => {
  // Arrange — A shares; B joins, saves and rates it 8 from My List.
  const link = await createCommunityAndReadLink(page, 'Feedback Club');
  const composer = page.getByRole('form', { name: 'Share a song' });
  await composer.getByLabel('Share a song or album').fill(SHARED);
  await composer.getByRole('button', { name: 'Post' }).click();
  const ownCard = postsOn(page).filter({ has: page.locator(`a[href="${SHARED}"]`) });
  await expect(ownCard).toBeVisible();
  const friend = await friendPage(browser);
  const friendName = await joinThroughLink(friend, link);
  const card = postsOn(friend).filter({ has: friend.locator(`a[href="${SHARED}"]`) });
  await card.getByRole('button', { name: 'Save to Listen Later' }).click();
  await expect(friend.getByText('Added to Listen Later')).toBeVisible();
  await friend
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'My List' })
    .click();
  await friend.getByRole('button', { name: /^Rate & Review/ }).click();
  const rateSheet = friend.getByRole('dialog', { name: 'Rate & Review' });
  await rateSheet.getByRole('radio', { name: '8' }).click();
  await rateSheet.getByLabel(/Comment/).fill('Still sounds fresh');
  await rateSheet.getByRole('button', { name: 'Submit Rating' }).click();
  await expect(friend.getByText('Rating submitted')).toBeVisible();

  // Act — A reloads the feed and opens the ratings.
  await page.reload();
  await expect(ownCard.getByText('★ 8 · 1 rating')).toBeVisible();
  await ownCard.getByRole('link', { name: 'View ratings' }).click();

  // Assert — B's name, score and comment.
  const ratings = page.getByRole('region', { name: 'Ratings' });
  const row = ratings.getByRole('listitem').filter({ hasText: friendName });
  await expect(row.getByText('8/10')).toBeVisible();
  await expect(row.getByText('Still sounds fresh')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Edit' })).toHaveCount(0);

  // Act — B opens the same post and edits the rating to 9.
  await friend.goBack();
  await friend.reload();
  await card.getByRole('link', { name: 'View ratings' }).click();
  await friend.getByRole('button', { name: 'Edit' }).click();
  const editSheet = friend.getByRole('dialog', { name: 'Edit your rating' });
  await editSheet.getByRole('radio', { name: '9' }).click();
  await editSheet.getByRole('button', { name: 'Save changes' }).click();

  // Assert — updated for B, and for A after a reload.
  await expect(friend.getByText('Rating updated')).toBeVisible();
  await expect(friend.getByRole('region', { name: 'Ratings' }).getByText('9/10')).toBeVisible();
  await page.reload();
  await expect(row.getByText('9/10')).toBeVisible();

  await friend.context().close();
});
