import { expect, type Page } from '@playwright/test';

import { newGoogleAccount, stubGoogle } from './googleStandIn';

/** Steps shared by the golden loops. Each asserts the screen it starts on. */

export async function signIn(page: Page, sub: string) {
  await stubGoogle(page, sub);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
}

export async function completeProfile(page: Page, displayName: string) {
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Generated' })).toBeChecked();
  await page.getByLabel('Display name').fill(displayName);
  await expect(page.getByText('✓ Available')).toBeVisible();
  await page.getByText('Apple Music', { exact: true }).click();
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
