import { expect, test, type Browser, type Page } from '@playwright/test';

import { newGoogleAccount, stubGoogle } from '../support/googleStandIn';
import { completeProfile, onboardedAccount } from '../support/flows';

/**
 * Phase 2 golden loop — docs/features/communities-invites.md §7.
 * An admin creates a community and shares its link; a brand-new friend opens
 * it signed out, signs up through it, and joins.
 */

/** A's community, with the invite panel that opens by itself after creating. */
async function createCommunityAndReadLink(page: Page, name: string): Promise<string> {
  await onboardedAccount(page);
  await page.getByRole('link', { name: 'Create community' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();

  const panel = page.getByRole('dialog', { name: 'Invite friends' });
  await expect(panel).toBeVisible();
  const link = panel.getByLabel('Invite link');
  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{22}$/);
  return link.inputValue();
}

/** A second person on their own device: a fresh browser context, signed out. */
async function friendPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test('a new friend opens the link signed out, signs up through it, and joins', async ({
  page,
  browser,
}) => {
  // Arrange — A creates the community and takes the link.
  const link = await createCommunityAndReadLink(page, 'Friday Jazz');
  const friend = await friendPage(browser);
  const account = newGoogleAccount();
  await stubGoogle(friend, account.sub);

  // Act — B opens the link before having an account.
  await friend.goto(link);

  // Assert — the public preview.
  await expect(friend.getByRole('heading', { name: 'Friday Jazz' })).toBeVisible();
  await expect(friend.getByText('1 member')).toBeVisible();
  await expect(friend.getByText('Continue with Google to join')).toBeVisible();

  // Act — sign up through the preview; onboarding brings B back to the invite.
  await friend.getByRole('button', { name: 'Continue with Google' }).click();
  await completeProfile(friend, account.displayName);
  await expect(friend).toHaveURL(new URL(link).pathname);
  await friend.getByRole('button', { name: 'Join community' }).click();

  // Assert — B is in, and A sees two members.
  await expect(friend.getByRole('heading', { name: 'Friday Jazz' })).toBeVisible();
  await expect(friend.getByText('2 members')).toBeVisible();
  await expect(friend.getByRole('button', { name: 'Invite friends' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await expect(page.getByText("2 members · You're an admin")).toBeVisible();

  await friend.context().close();
});

test('after the admin resets the link, the old one is dead', async ({ page, browser }) => {
  // Arrange
  const oldLink = await createCommunityAndReadLink(page, 'Sunday Vinyl');
  const panel = page.getByRole('dialog', { name: 'Invite friends' });

  // Act — reset, with confirmation.
  await panel.getByRole('button', { name: 'Reset link' }).click();
  await panel.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(panel.getByText('New link created. The old one no longer works.')).toBeVisible();
  const newLink = await panel.getByLabel('Invite link').inputValue();

  // Assert — the old link shows the UC-15 message; the new one previews.
  expect(newLink).not.toBe(oldLink);
  const friend = await friendPage(browser);
  await friend.goto(oldLink);
  await expect(friend.getByRole('alert')).toContainText(
    'This invite link is invalid or has expired.',
  );
  await friend.goto(newLink);
  await expect(friend.getByRole('heading', { name: 'Sunday Vinyl' })).toBeVisible();

  await friend.context().close();
});
