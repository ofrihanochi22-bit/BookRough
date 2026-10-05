import { expect, type Browser, type Page } from '@playwright/test';

import { newGoogleAccount, stubGoogle } from './googleStandIn';

/** Steps shared by the golden loops. Each asserts the screen it starts on. */

export async function signIn(page: Page, sub: string) {
  await stubGoogle(page, sub);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
}

export async function completeProfile(page: Page, displayName: string, service = 'Apple Music') {
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Generated' })).toBeChecked();
  await page.getByLabel('Display name').fill(displayName);
  await expect(page.getByText('✓ Available')).toBeVisible();
  await page.getByText(service, { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** The Communities Dashboard, which is home once onboarding is done. */
export const dashboardHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Your communities' });

/** A brand-new account, signed in and onboarded, standing on the dashboard. */
export async function onboardedAccount(page: Page) {
  const account = newGoogleAccount();
  await signIn(page, account.sub);
  await completeProfile(page, account.displayName);
  await expect(dashboardHeading(page)).toBeVisible();
  return account;
}

/** Sign out lives on the Profile tab. */
export async function signOut(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();
}

/** An onboarded user creates a community and reads its link from the invite panel. */
export async function createCommunityAndReadLink(page: Page, name: string): Promise<string> {
  await onboardedAccount(page);
  await page.getByRole('link', { name: 'Create community' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();

  const panel = page.getByRole('dialog', { name: 'Invite friends' });
  await expect(panel).toBeVisible();
  const link = panel.getByLabel('Invite link');
  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{22}$/);
  const value = await link.inputValue();
  await panel.getByRole('button', { name: 'Close' }).click();
  return value;
}

/** A second person on their own device: a fresh browser context, signed out. */
export async function friendPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** A brand-new friend signs up through the link and joins. Returns their display name. */
export async function joinThroughLink(
  friend: Page,
  link: string,
  service = 'Apple Music',
): Promise<string> {
  const account = newGoogleAccount();
  await stubGoogle(friend, account.sub);
  await friend.goto(link);
  await friend.getByRole('button', { name: 'Continue with Google' }).click();
  await completeProfile(friend, account.displayName, service);
  await friend.getByRole('button', { name: 'Join community' }).click();
  await expect(friend.getByRole('link', { name: 'Settings' })).toBeVisible();
  return account.displayName;
}
