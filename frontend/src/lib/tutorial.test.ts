import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { makeSession, resetAuthStore } from '../test/fixtures';
import { dismissTutorialItem } from './tutorial';

const { markTutorialSeen } = vi.hoisted(() => ({ markTutorialSeen: vi.fn() }));
vi.mock('../api/users', () => ({ markTutorialSeen }));

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore
    .getState()
    .setSession(makeSession({ tutorial: { walkthrough: true, saveTip: true, listTip: true } }));
});

afterEach(() => {
  resetAuthStore();
});

describe('dismissTutorialItem', () => {
  it('hides the item at once and tells the server', () => {
    // Arrange
    markTutorialSeen.mockResolvedValue({});

    // Act
    dismissTutorialItem('listTip');

    // Assert
    expect(useAuthStore.getState().tutorial.listTip).toBe(false);
    expect(markTutorialSeen).toHaveBeenCalledWith('listTip');
  });

  it('swallows a server failure: the item stays hidden', async () => {
    // Arrange
    markTutorialSeen.mockRejectedValue(new Error('offline'));

    // Act
    dismissTutorialItem('walkthrough');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Assert
    expect(useAuthStore.getState().tutorial.walkthrough).toBe(false);
  });
});
