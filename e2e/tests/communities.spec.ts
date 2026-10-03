import { expect, test } from '@playwright/test';

import { dashboardHeading, onboardedAccount } from '../support/flows';

/**
 * Phase 2 golden loop, first part — docs/features/communities-create.md §8.
 * Create a community, land on it, and find it on the dashboard.
 */

test('a new user creates a community and sees it on the dashboard', async ({ page }) => {
  // Arrange
  await onboardedAccount(page);
  await expect(page.getByRole('heading', { name: 'Start your first community' })).toBeVisible();

  // Act
  await page.getByRole('link', { name: 'Create community' }).click();
  await expect(page.getByRole('heading', { name: 'New community' })).toBeVisible();
  await page.getByLabel('Name').fill('Friday Jazz');
  await page.getByLabel(/Description/).fill('Late-night records only.');
  await page.getByRole('button', { name: 'Create' }).click();

  // Assert — the new community's page
  await expect(page.getByRole('heading', { name: 'Friday Jazz' })).toBeVisible();
  await expect(page.getByText("1 member · You're an admin")).toBeVisible();
  await expect(page).toHaveURL(/\/communities\/[0-9a-f-]{36}$/);

  // Act — Back returns to the dashboard, not to the form
  await page.goBack();

  // Assert
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page.getByRole('link', { name: /Friday Jazz/ })).toContainText('1 member · Admin');
});
