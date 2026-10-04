import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { makeAdmin } from '../support/database';
import { onboardedAccount } from '../support/flows';

/**
 * Admin settings golden loop — docs/features/admin-panel.md §7 (Part 2).
 *
 * The settings are global, so this test runs in one project only: two copies
 * running side by side would overwrite each other's banner mid-assertion. It
 * puts the defaults back at the end, so no other test inherits its settings.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'global settings: one project only');

test('an admin changes the settings; a friend sees the banner and a visitor the tagline', async ({
  page,
  browser,
}) => {
  // Arrange
  const id = randomUUID().slice(0, 8);
  const notice = `E2E notice ${id}`;
  const tagline = `E2E tagline ${id}`;
  const admin = await onboardedAccount(page);
  makeAdmin(admin.sub);
  await page.goto('/admin/settings');
  await expect(page.getByText('Recent changes')).toBeVisible();

  try {
    // Act — the admin turns the banner on and changes the colour and tagline.
    await page.getByLabel('Banner text').fill(notice);
    await page.getByRole('switch').check();
    await page.getByText('Green', { exact: true }).click();
    await page.getByLabel('Welcome tagline').fill(tagline);
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Assert — saved, recorded, and applied to the admin's own app at once.
    await expect(page.getByText('Settings saved')).toBeVisible();
    await expect(page.getByText(`turned on the banner: “${notice}”`)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'green');

    // Assert — a friend signing in sees the banner.
    const friend = await (await browser.newContext()).newPage();
    await onboardedAccount(friend);
    await expect(friend.getByRole('status').filter({ hasText: notice })).toBeVisible();

    // Assert — a signed-out visitor sees the tagline, and no banner text anywhere.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto('/');
    await expect(visitor.getByText(tagline)).toBeVisible();
    await expect(visitor.getByText(notice)).toHaveCount(0);
  } finally {
    // Back to the defaults, through the same screen.
    // Each step only if needed, so a failure part-way still cleans up.
    await page.goto('/admin/settings');
    await expect(page.getByText('Recent changes')).toBeVisible();
    await page.getByRole('switch').uncheck();
    await page.getByText('Purple', { exact: true }).click();
    const reset = page.getByRole('button', { name: 'Reset to default' });
    if (await reset.isEnabled()) {
      await reset.click();
    }
    const save = page.getByRole('button', { name: 'Save changes' });
    if (await save.isEnabled()) {
      await save.click();
      await expect(page.getByText('Settings saved')).toBeVisible();
    }
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'purple');
  }
});
