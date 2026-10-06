import { expect, test, type Page } from '@playwright/test';

import {
  createCommunityAndReadLink,
  friendPage,
  joinThroughLink,
  onboardedAccount,
} from '../support/flows';

/**
 * Phase 5 golden loop, the "find people" step — docs/features/find-people.md
 * §7. The link is not in the scraper stand-in's fixtures, so it saves at once
 * as a pending post.
 */

const SHARED = 'https://open.spotify.com/track/5555555555555555555551';

const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');

async function searchFor(page: Page, text: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Search' })
    .click();
  await page.getByLabel('Search people').fill(text);
  return page.getByRole('list', { name: 'Results' });
}

test('a member finds a friend by part of their name and sees their rating; a stranger sees none', async ({
  page,
  browser,
}) => {
  // Arrange — A shares; B joins, saves and rates it 8 from My List.
  const link = await createCommunityAndReadLink(page, 'Discovery Club');
  const composer = page.getByRole('form', { name: 'Share a song' });
  await composer.getByLabel('Share a song or album').fill(SHARED);
  await composer.getByRole('button', { name: 'Post' }).click();
  await expect(postsOn(page).filter({ has: page.locator(`a[href="${SHARED}"]`) })).toBeVisible();
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
  await rateSheet.getByLabel(/Comment/).fill('Found you');
  await rateSheet.getByRole('button', { name: 'Submit Rating' }).click();
  await expect(friend.getByText('Rating submitted')).toBeVisible();

  // Act — A searches the lower-cased end of B's name and opens the profile.
  const results = await searchFor(page, friendName.slice(-6).toLowerCase());
  await results.getByRole('link', { name: friendName }).click();

  // Assert — B's profile with the rating, which opens its Post Detail.
  await expect(page.getByRole('heading', { name: friendName })).toBeVisible();
  await expect(page.getByText('Listens on Apple Music')).toBeVisible();
  const ratings = page.getByRole('region', { name: 'Ratings' });
  const row = ratings.getByRole('link').filter({ hasText: 'Found you' });
  await expect(row).toContainText('8/10');
  await expect(row).toContainText('in Discovery Club');
  await row.click();
  await expect(page).toHaveURL(/\/posts\//);
  await expect(page.getByRole('link', { name: '← Discovery Club' })).toBeVisible();

  // Act — a stranger, in no shared community, finds B by full name.
  const stranger = await friendPage(browser);
  await onboardedAccount(stranger);
  const strangerResults = await searchFor(stranger, friendName);
  await strangerResults.getByRole('link', { name: friendName }).click();

  // Assert — the profile, without B's rating.
  await expect(stranger.getByRole('heading', { name: friendName })).toBeVisible();
  await expect(stranger.getByText('No ratings to show')).toBeVisible();

  await friend.context().close();
  await stranger.context().close();
});
