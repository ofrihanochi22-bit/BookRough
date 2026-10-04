import { expect, test, type Page } from '@playwright/test';

import { onboardedAccount } from '../support/flows';

/**
 * My Profile golden loops — docs/features/profile-settings.md §7.
 * Every onboarding here picks the generated avatar, so the Google photo starts declined.
 */

async function openProfile(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
}

test('a new display name and service persist after a reload', async ({ page }) => {
  // Arrange
  const account = await onboardedAccount(page);
  await openProfile(page);
  const newName = `${account.displayName} B`;

  // Act
  await page.getByLabel('Display name').fill(newName);
  await expect(page.getByText('✓ Available')).toBeVisible();
  await page.getByText('Deezer', { exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Profile updated')).toBeVisible();
  await page.reload();

  // Assert
  await expect(page.getByLabel('Display name')).toHaveValue(newName);
  await expect(page.getByRole('radio', { name: 'Deezer' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

test('the Google photo can be re-chosen through Google, then switched back', async ({ page }) => {
  // Arrange — onboarded with the generated avatar; the stand-in signs as the same account.
  await onboardedAccount(page);
  await openProfile(page);

  // Act — re-choose the Google photo.
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  // Assert
  const switchBack = page.getByRole('button', { name: 'Use generated avatar' });
  await expect(switchBack).toBeVisible();
  await page.reload();
  await expect(switchBack).toBeVisible();

  // Act — back to the generated avatar.
  await switchBack.click();

  // Assert
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});
