import { expect, test, type Page } from '@playwright/test';

import { friendPage, onboardedAccount } from '../support/flows';

/**
 * Phase 5 golden loop, "friends bring each other into communities" —
 * docs/features/invite-friends.md §7. Fresh accounts, so nothing is shared
 * with parallel tests.
 */

const tab = (page: Page, name: string | RegExp) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test('a friend is invited on the create form and joins from the Friends tab', async ({
  page,
  browser,
}) => {
  // Arrange — A and B become friends.
  const owner = await onboardedAccount(page);
  const guest = await friendPage(browser);
  const guestAccount = await onboardedAccount(guest);
  await tab(page, 'Search').click();
  await page.getByLabel('Search people').fill(guestAccount.displayName);
  await page
    .getByRole('list', { name: 'Results' })
    .getByRole('link', { name: guestAccount.displayName })
    .click();
  await page.getByRole('button', { name: 'Add Friend' }).click();
  await expect(page.getByRole('button', { name: 'Request sent' })).toBeVisible();
  await tab(guest, 'Search').click();
  await tab(guest, 'Friends, 1 waiting').click();
  await guest.getByRole('button', { name: `Accept ${owner.displayName}` }).click();
  await expect(guest.getByText(`You're now friends with ${owner.displayName}.`)).toBeVisible();

  // Act — A creates a community and ticks B.
  await tab(page, 'Home').click();
  await page.getByRole('link', { name: 'Create community' }).click();
  await page.getByLabel('Name').fill('Invited Club');
  await page.getByRole('checkbox', { name: `Invite ${guestAccount.displayName}` }).check();
  await page.getByRole('button', { name: 'Create' }).click();

  // Assert — the panel opens by itself, showing B as invited.
  const panel = page.getByRole('dialog', { name: 'Invite friends' });
  await expect(
    panel.getByRole('button', { name: `Invited ${guestAccount.displayName}, tap to cancel` }),
  ).toBeVisible();

  // Act — B sees the badge, opens Friends, joins.
  await tab(guest, 'Home').click();
  await tab(guest, 'Friends, 1 waiting').click();
  const invitations = guest.getByRole('region', { name: 'Invitations' });
  await expect(invitations.getByText(`${owner.displayName} invited you · 1 member`)).toBeVisible();
  await invitations.getByRole('button', { name: 'Join Invited Club' }).click();

  // Assert — B lands in the community, which now has two members.
  await expect(guest.getByRole('heading', { name: 'Invited Club' })).toBeVisible();
  await expect(guest.getByText('You joined Invited Club.')).toBeVisible();
  await expect(tab(guest, 'Friends')).toBeVisible();

  await guest.context().close();
});
