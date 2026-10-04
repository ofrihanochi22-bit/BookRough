import { expect, test, type Page } from '@playwright/test';

import {
  createCommunityAndReadLink,
  dashboardHeading,
  friendPage,
  joinThroughLink,
} from '../support/flows';

/**
 * Phase 2 golden loop, last part — docs/features/communities-membership.md §7.
 * Removing blocks; unblocking lets back in; ownership moves before the owner
 * leaves; only the owner deletes.
 */

async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function actOn(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('button', { name: action }).click();
}

test('removing a member blocks them; unblocking lets them join again', async ({
  page,
  browser,
}) => {
  // Arrange — A's community, which B joins.
  const link = await createCommunityAndReadLink(page, 'Friday Jazz');
  const friend = await friendPage(browser);
  const friendName = await joinThroughLink(friend, link);
  const communityUrl = friend.url();

  // Act — A removes B.
  await page.reload();
  await openSettings(page);
  await actOn(page, friendName, 'Remove from community');
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();

  // Assert — B lands under Blocked, loses the community, and the link looks dead to them.
  await expect(page.getByRole('heading', { name: 'Blocked' })).toBeVisible();
  await friend.goto(communityUrl);
  await expect(friend.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
  await friend.goto(link);
  await expect(friend.getByRole('alert')).toContainText(
    'This invite link is invalid or has expired.',
  );

  // Act — A unblocks B; B joins again through the same link.
  await page.getByRole('button', { name: 'Unblock' }).click();
  await expect(page.getByRole('heading', { name: 'Blocked' })).toHaveCount(0);
  await friend.goto(link);
  await friend.getByRole('button', { name: 'Join community' }).click();

  // Assert
  await expect(friend.getByText('2 members')).toBeVisible();

  await friend.context().close();
});

test('the owner hands over ownership and leaves; the new owner deletes the community', async ({
  page,
  browser,
}) => {
  // Arrange
  const link = await createCommunityAndReadLink(page, 'Sunday Vinyl');
  const friend = await friendPage(browser);
  const friendName = await joinThroughLink(friend, link);
  await page.reload();
  await openSettings(page);

  // Act — A tries to leave as owner, then transfers and leaves.
  await page.getByRole('button', { name: 'Leave community' }).click();
  await expect(page.getByRole('dialog')).toContainText("You're the owner.");
  await page.getByRole('button', { name: 'OK' }).click();
  await actOn(page, friendName, 'Make owner');
  await page.getByRole('dialog').getByRole('button', { name: 'Make owner' }).click();
  await expect(page.getByRole('button', { name: 'Delete community' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave community' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();

  // Assert — A is back on an empty dashboard.
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start your first community' })).toBeVisible();

  // Act — B, now the owner, deletes the community.
  await friend.reload();
  await openSettings(friend);
  await friend.getByRole('button', { name: 'Delete community' }).click();
  const sheet = friend.getByRole('dialog', { name: 'Delete community' });
  const confirm = sheet.getByRole('button', { name: 'Delete community' });
  await expect(confirm).toBeDisabled();
  await sheet.getByRole('checkbox').check();
  await confirm.click();

  // Assert
  await expect(dashboardHeading(friend)).toBeVisible();
  await expect(friend.getByRole('heading', { name: 'Start your first community' })).toBeVisible();

  await friend.context().close();
});
