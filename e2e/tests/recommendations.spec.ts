import { expect, test, type Page } from '@playwright/test';

import { friendPage, onboardedAccount, openSearch } from '../support/flows';
import { completeProfile, dashboardHeading, signIn } from '../support/flows';
import { newGoogleAccount } from '../support/googleStandIn';

/**
 * Golden loop for direct recommendations — docs/features/direct-recommendations.md
 * §7. Two friends with different services and no community in common: one sends,
 * the other gets their own service and rates, and the first sees the score.
 * Fresh accounts, so nothing is shared with parallel tests.
 */

const KNOWN_TRACK = 'https://open.spotify.com/track/1111111111111111111111';
const APPLE_LINK = 'https://music.apple.com/us/song/stand-in-song/1111111111';
const DEEZER_LINK = 'https://www.deezer.com/track/1111111111';

const tab = (page: Page, name: string | RegExp) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test('friends send a song directly, each on their own service, and rate it', async ({
  page,
  browser,
}) => {
  // Arrange — two fresh accounts on different services, then friends.
  const sender = await onboardedAccount(page);
  const receiver = await friendPage(browser);
  const receiverAccount = newGoogleAccount();
  await signIn(receiver, receiverAccount.sub);
  await completeProfile(receiver, receiverAccount.displayName, 'Deezer');
  await expect(dashboardHeading(receiver)).toBeVisible();

  await openSearch(page);
  await page.getByLabel('Search people').fill(receiverAccount.displayName);
  await page
    .getByRole('list', { name: 'Results' })
    .getByRole('link', { name: receiverAccount.displayName })
    .click();
  await page.getByRole('button', { name: 'Add Friend' }).click();
  await expect(page.getByRole('button', { name: 'Request sent' })).toBeVisible();
  await openSearch(receiver);
  await tab(receiver, 'Friends, 1 waiting').click();
  await receiver.getByRole('button', { name: `Accept ${sender.displayName}` }).click();
  await expect(receiver.getByText(`You're now friends with ${sender.displayName}.`)).toBeVisible();

  // Act — the sender sends a song from the friend's profile.
  await page.reload();
  await page.getByRole('button', { name: 'Send a song' }).click();
  const sheet = page.getByRole('dialog', { name: 'Send a song' });
  await sheet.getByLabel('Song or album link').fill(KNOWN_TRACK);
  await sheet.getByLabel(/Comment/).fill('Reminds me of our trip');
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(`Sent to ${receiverAccount.displayName}`)).toBeVisible();

  // Assert — the receiver is notified on the Home tab (notifications.md §5.3: the
  // Friends badge counts only what waits for an answer), and finds the song in
  // their own service from the Recommendations row.
  await openSearch(receiver);
  await expect(tab(receiver, /^Home, \d+ unread$/)).toBeVisible();
  await tab(receiver, 'Friends').click();
  await receiver.getByRole('link', { name: 'Recommendations, 1 new' }).click();
  const card = receiver.getByRole('article').filter({ hasText: 'Stand-in Song' });
  await expect(card.getByText('Reminds me of our trip')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open in Deezer' })).toHaveAttribute(
    'href',
    DEEZER_LINK,
  );

  // Assert — opening Received cleared the badge.
  await expect(tab(receiver, /^Friends$/)).toBeVisible();

  // Act — the receiver rates it where it arrived.
  await card.getByRole('button', { name: /^Rate & Review/ }).click();
  const rating = receiver.getByRole('dialog', { name: 'Rate & Review' });
  await rating.getByRole('radio', { name: '8' }).click();
  await rating.getByRole('button', { name: 'Submit Rating' }).click();
  await expect(card.getByText('You: 8')).toBeVisible();

  // Assert — the sender finds the score under Sent, on their own service.
  await tab(page, /^Friends/).click();
  await page.getByRole('link', { name: 'Recommendations' }).click();
  await page.getByRole('button', { name: 'Sent' }).click();
  const sent = page.getByRole('article').filter({ hasText: 'Stand-in Song' });
  await expect(sent.getByLabel(/★ 8/)).toBeVisible();
  await expect(sent.getByRole('link', { name: 'Open in Apple Music' })).toHaveAttribute(
    'href',
    APPLE_LINK,
  );

  await receiver.context().close();
});
