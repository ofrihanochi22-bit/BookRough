import { expect, test, type Page } from '@playwright/test';

import { createCommunityAndReadLink, friendPage, joinThroughLink } from '../support/flows';

/**
 * Phase 4 golden loop, the "save for later" step — docs/features/bookmarks-my-list.md
 * §7. The link is not in the scraper stand-in's fixtures, so it saves at once
 * as a pending post, which opens its original link everywhere.
 */

const SHARED = 'https://open.spotify.com/track/5555555555555555555555';

const postsOn = (page: Page) => page.getByRole('region', { name: 'Posts' }).getByRole('article');

test('a friend saves a post, finds it in My List, and removes it', async ({ page, browser }) => {
  // Arrange — A owns the community and shares a link; B joins.
  const link = await createCommunityAndReadLink(page, 'Listen Later Club');
  const composer = page.getByRole('form', { name: 'Share a song' });
  await composer.getByLabel('Share a song or album').fill(SHARED);
  await composer.getByRole('button', { name: 'Post' }).click();
  const ownCard = postsOn(page).filter({ has: page.locator(`a[href="${SHARED}"]`) });
  await expect(ownCard).toBeVisible();
  const friend = await friendPage(browser);
  await joinThroughLink(friend, link, 'Spotify');

  // Assert — no bookmark on your own post.
  await expect(ownCard.getByRole('button', { name: /Listen Later/ })).toHaveCount(0);

  // Act — B saves A's post.
  const card = postsOn(friend).filter({ has: friend.locator(`a[href="${SHARED}"]`) });
  await card.getByRole('button', { name: 'Save to Listen Later' }).click();

  // Assert
  await expect(friend.getByText('Added to Listen Later')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Remove from Listen Later' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Act — B opens My List.
  await friend
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'My List' })
    .click();

  // Assert
  await expect(friend.getByRole('heading', { name: 'My List' })).toBeVisible();
  const saved = friend.getByRole('article').filter({ hasText: 'Listen Later Club' });
  await expect(saved.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
    'href',
    SHARED,
  );

  // Act — B removes it.
  await saved.getByRole('button', { name: 'Remove' }).click();

  // Assert
  await expect(friend.getByText('Removed from Listen Later')).toBeVisible();
  await expect(friend.getByText('Nothing saved yet')).toBeVisible();

  await friend.context().close();
});
