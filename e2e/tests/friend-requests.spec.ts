import { expect, test, type Page } from '@playwright/test';

import { friendPage, onboardedAccount } from '../support/flows';

/**
 * Phase 5 golden loop, "two users, one sends a request, the other accepts" —
 * docs/features/friend-requests.md §7. Fresh accounts, so nothing is shared
 * with parallel tests.
 */

const tab = (page: Page, name: string | RegExp) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test('a user sends a request; the other accepts it from the Friends tab, then removes them', async ({
  page,
  browser,
}) => {
  // Arrange — two fresh accounts.
  const sender = await onboardedAccount(page);
  const receiver = await friendPage(browser);
  const receiverAccount = await onboardedAccount(receiver);

  // Act — the sender finds the receiver by name and taps Add Friend.
  await tab(page, 'Search').click();
  await page.getByLabel('Search people').fill(receiverAccount.displayName);
  await page
    .getByRole('list', { name: 'Results' })
    .getByRole('link', { name: receiverAccount.displayName })
    .click();
  await page.getByRole('button', { name: 'Add Friend' }).click();

  // Assert — the button reflects it.
  await expect(page.getByRole('button', { name: 'Request sent' })).toBeVisible();

  // Act — the receiver navigates, sees the badge, and opens Friends.
  await tab(receiver, 'Search').click();
  await tab(receiver, 'Friends, 1 request').click();
  const requests = receiver.getByRole('region', { name: 'Requests' });
  await expect(requests.getByRole('link', { name: sender.displayName })).toBeVisible();
  await requests.getByRole('button', { name: `Accept ${sender.displayName}` }).click();

  // Assert — friends on both sides; the badge is gone.
  await expect(receiver.getByText(`You're now friends with ${sender.displayName}.`)).toBeVisible();
  await expect(
    receiver
      .getByRole('region', { name: 'Your friends' })
      .getByRole('link', { name: sender.displayName }),
  ).toBeVisible();
  await expect(tab(receiver, 'Friends')).toBeVisible();
  await page.reload();
  await expect(page.getByText('✓ Friends')).toBeVisible();
  await tab(page, 'Friends').click();
  await expect(
    page
      .getByRole('region', { name: 'Your friends' })
      .getByRole('link', { name: receiverAccount.displayName }),
  ).toBeVisible();

  // Act — the receiver removes the sender (UC-8, docs/features/unfriend.md §7).
  await receiver.getByRole('button', { name: `Actions for ${sender.displayName}` }).click();
  const sheet = receiver.getByRole('dialog', { name: 'Remove friend?' });
  await sheet.getByRole('button', { name: 'Remove friend' }).click();

  // Assert — gone for both, silently: the sender's profile of them offers Add Friend again.
  await expect(
    receiver.getByText(`Removed ${sender.displayName} from your friends.`),
  ).toBeVisible();
  await expect(receiver.getByText('No friends yet')).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add Friend' })).toBeVisible();

  await receiver.context().close();
});
