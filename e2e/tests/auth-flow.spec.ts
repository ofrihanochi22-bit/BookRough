import { expect, test, type Page } from '@playwright/test';

import { newGoogleAccount, stubGoogle } from '../support/googleStandIn';

/**
 * Phase 1 golden loop — docs/features/auth-flow-e2e.md §5.
 * Real browser, built frontend, real API, real Postgres; only Google is stood in.
 */

async function signIn(page: Page, sub: string) {
  await stubGoogle(page, sub);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
}

async function completeProfile(page: Page, displayName: string) {
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Generated' })).toBeChecked();
  await page.getByLabel('Display name').fill(displayName);
  await expect(page.getByText('✓ Available')).toBeVisible();
  await page.getByText('Apple Music', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

const homeHeading = (page: Page, displayName: string) =>
  page.getByRole('heading', { name: `Hi, ${displayName}` });

test('first sign-in goes through Complete Your Profile to home', async ({ page }) => {
  // Arrange
  const account = newGoogleAccount();

  // Act
  await signIn(page, account.sub);
  await completeProfile(page, account.displayName);

  // Assert
  await expect(homeHeading(page, account.displayName)).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test('the session survives a reload; signing out and back in skips onboarding', async ({
  page,
}) => {
  // Arrange
  const account = newGoogleAccount();
  await signIn(page, account.sub);
  await completeProfile(page, account.displayName);
  await expect(homeHeading(page, account.displayName)).toBeVisible();

  // Act — reload
  await page.reload();

  // Assert
  await expect(homeHeading(page, account.displayName)).toBeVisible();

  // Act — sign out
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Assert
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();

  // Act — sign in again as the same Google account
  await signIn(page, account.sub);

  // Assert
  await expect(homeHeading(page, account.displayName)).toBeVisible();
});

test('abandoned onboarding resumes on the next sign-in', async ({ page }) => {
  // Arrange
  const account = newGoogleAccount();
  await signIn(page, account.sub);
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();

  // Act
  await signIn(page, account.sub);

  // Assert
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
});
