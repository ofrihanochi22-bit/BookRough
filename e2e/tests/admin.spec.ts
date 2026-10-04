import { expect, test } from '@playwright/test';

import { makeAdmin } from '../support/database';
import { onboardedAccount } from '../support/flows';

/**
 * Admin area golden loop — docs/features/admin-panel.md §7 (Part 1).
 * The role is set in the test database, exactly as the owner sets it for real.
 */

test('an admin reaches the lists from My Profile; a normal user sees not-found', async ({
  page,
  browser,
}) => {
  // Arrange — the admin, promoted in the database, then a reload refreshes the session.
  const admin = await onboardedAccount(page);
  makeAdmin(admin.sub);
  await page.reload();

  // Act
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await page.getByRole('link', { name: /Admin area/ }).click();

  // Assert
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  await expect(page.getByText(admin.displayName)).toBeVisible();
  await page.getByRole('link', { name: 'Communities' }).click();
  await expect(page).toHaveURL(/\/admin\/communities$/);

  // Act — a different, ordinary person types the address.
  const other = await (await browser.newContext()).newPage();
  await onboardedAccount(other);
  await other.goto('/admin');

  // Assert
  await expect(other.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
  await other.goto('/profile');
  await expect(other.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(other.getByRole('link', { name: /Admin area/ })).toHaveCount(0);
});
