import { afterEach, describe, expect, it } from 'vitest';

import { makeSession, resetAuthStore } from '../test/fixtures';
import { NO_TUTORIAL, useAuthStore } from './auth';

const ALL = { walkthrough: true, saveTip: true, listTip: true };

afterEach(() => {
  resetAuthStore();
});

describe('auth store — tutorial state (onboarding-tutorial.md §5.4)', () => {
  it('takes the tutorial flags from the session', () => {
    // Act
    useAuthStore.getState().setSession(makeSession({ tutorial: ALL }));

    // Assert
    expect(useAuthStore.getState().tutorial).toEqual(ALL);
  });

  it('shows nothing for a session without the field', () => {
    // Act
    useAuthStore.getState().setSession(makeSession());

    // Assert
    expect(useAuthStore.getState().tutorial).toEqual(NO_TUTORIAL);
  });

  it('hides one item at once when it is marked seen', () => {
    // Arrange
    useAuthStore.getState().setSession(makeSession({ tutorial: ALL }));

    // Act
    useAuthStore.getState().markTutorialSeen('saveTip');

    // Assert
    expect(useAuthStore.getState().tutorial).toEqual({ ...ALL, saveTip: false });
  });

  it('keeps a closed item hidden when a later session still says to show it', () => {
    // Arrange: the background PATCH failed or has not landed yet
    useAuthStore.getState().setSession(makeSession({ tutorial: ALL }));
    useAuthStore.getState().markTutorialSeen('walkthrough');
    useAuthStore.getState().markTutorialSeen('walkthrough');

    // Act: a profile save, say, returns the session
    useAuthStore.getState().setSession(makeSession({ tutorial: ALL }));

    // Assert
    expect(useAuthStore.getState().tutorial).toEqual({ ...ALL, walkthrough: false });
    expect(useAuthStore.getState().tutorialClosed).toEqual(['walkthrough']);
  });

  it('forgets closed items on sign-out', () => {
    // Arrange
    useAuthStore.getState().setSession(makeSession({ tutorial: ALL }));
    useAuthStore.getState().markTutorialSeen('listTip');

    // Act
    useAuthStore.getState().clear();
    useAuthStore.getState().setSession(makeSession({ tutorial: ALL }));

    // Assert
    expect(useAuthStore.getState().tutorial).toEqual(ALL);
  });
});
