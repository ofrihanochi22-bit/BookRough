import { expect, test } from '@playwright/test';

import { newGoogleAccount } from '../support/googleStandIn';
import { completeProfile, dashboardHeading, signIn, signOut } from '../support/flows';

/**
 * Phase 1 golden loop — docs/features/auth-flow-e2e.md §5.
 * Real browser, built frontend, real API, real Postgres; only Google is stood in.
 * Home is the Communities Dashboard since docs/features/communities-create.md.
 */

test('first sign-in goes through Complete Your Profile to home', async ({ page }) => {
  // Arrange
  const account = newGoogleAccount();

  // Act
  await signIn(page, account.sub);
  await completeProfile(page, account.displayName);

  // Assert
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test('the session survives a reload; signing out and back in skips onboarding', async ({
  page,
}) => {
  // Arrange
  const account = newGoogleAccount();
  await signIn(page, account.sub);
  await completeProfile(page, account.displayName);
  await expect(dashboardHeading(page)).toBeVisible();

  // Act — reload
  await page.reload();

  // Assert
  await expect(dashboardHeading(page)).toBeVisible();

  // Act — sign out
  await signOut(page);

  // Assert
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();

  // Act — sign in again as the same Google account
  await signIn(page, account.sub, 'signin');

  // Assert
  await expect(dashboardHeading(page)).toBeVisible();
});

test('abandoned onboarding resumes on the next sign-in', async ({ page }) => {
  // Arrange
  const account = newGoogleAccount();
  await signIn(page, account.sub);
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'BookRough' })).toBeVisible();

  // Act
  await signIn(page, account.sub, 'signin');

  // Assert
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
});

test('Sign in with a new Google account creates nothing until Create account', async ({ page }) => {
  // Arrange
  const account = newGoogleAccount();

  // Act — the wrong choice: Sign in, with no account yet.
  await signIn(page, account.sub, 'signin');

  // Assert — a notice, still on Welcome.
  await expect(page.getByText('No account for this Google account yet.')).toBeVisible();

  // Act — one tap, no second Google popup.
  await page.getByRole('button', { name: 'Create account' }).click();

  // Assert
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible();
});
