import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markTutorialSeen, setTutorialEnabled, tutorialState } from './tutorial.service.js';

/*
 * docs/features/onboarding-tutorial.md §7 — unit. Prisma is mocked; the
 * integration suite covers the real null-only update.
 */
const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock('../db/prisma.js', () => ({ prisma: { user: { updateMany } } }));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '7f8a1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
    googleSub: 'google-sub-1',
    displayName: 'Ofri',
    displayNameKey: 'ofri',
    profilePictureUrl: null,
    useGooglePicture: false,
    preferredService: 'SPOTIFY',
    role: 'USER',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    recommendationsSeenAt: null,
    walkthroughSeenAt: null,
    saveTipSeenAt: null,
    listTipSeenAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  setTutorialEnabled(true);
});

describe('tutorialState', () => {
  it('shows all three items to an onboarded user who has seen nothing', () => {
    // Act
    const state = tutorialState(makeUser(), false);

    // Assert
    expect(state).toEqual({ walkthrough: true, saveTip: true, listTip: true });
  });

  it('shows only the items not seen yet', () => {
    // Arrange
    const user = makeUser({ saveTipSeenAt: new Date() });

    // Act
    const state = tutorialState(user, false);

    // Assert
    expect(state).toEqual({ walkthrough: true, saveTip: false, listTip: true });
  });

  it('shows nothing while the user is still onboarding', () => {
    // Act
    const state = tutorialState(makeUser(), true);

    // Assert
    expect(state).toEqual({ walkthrough: false, saveTip: false, listTip: false });
  });

  it('shows nothing when TUTORIAL_ENABLED=false', () => {
    // Arrange
    setTutorialEnabled(false);

    // Act
    const state = tutorialState(makeUser(), false);

    // Assert
    expect(state).toEqual({ walkthrough: false, saveTip: false, listTip: false });
  });
});

describe('markTutorialSeen', () => {
  it('sets a null column, guarded so a concurrent write keeps the first time', async () => {
    // Arrange
    const user = makeUser();

    // Act
    const updated = await markTutorialSeen(user, 'walkthrough');

    // Assert
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: user.id, walkthroughSeenAt: null },
      data: { walkthroughSeenAt: expect.any(Date) },
    });
    expect(updated.walkthroughSeenAt).toBeInstanceOf(Date);
    expect(updated.saveTipSeenAt).toBeNull();
  });

  it.each([
    ['saveTip', 'saveTipSeenAt'],
    ['listTip', 'listTipSeenAt'],
  ] as const)('maps %s to %s', async (item, column) => {
    // Act
    const updated = await markTutorialSeen(makeUser(), item);

    // Assert
    expect(updateMany.mock.calls[0]?.[0].where).toHaveProperty(column, null);
    expect(updated[column]).toBeInstanceOf(Date);
  });

  it('writes nothing when the item was already seen, keeping the first time', async () => {
    // Arrange
    const first = new Date('2026-11-02T10:00:00Z');
    const user = makeUser({ listTipSeenAt: first });

    // Act
    const updated = await markTutorialSeen(user, 'listTip');

    // Assert
    expect(updateMany).not.toHaveBeenCalled();
    expect(updated.listTipSeenAt).toBe(first);
  });

  it('passes a database failure on to the error handler', async () => {
    // Arrange
    updateMany.mockRejectedValue(new Error('connection lost'));

    // Act & Assert
    await expect(markTutorialSeen(makeUser(), 'walkthrough')).rejects.toThrow('connection lost');
  });
});
