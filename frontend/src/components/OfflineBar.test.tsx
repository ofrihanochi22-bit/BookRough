import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { makeSession, resetAuthStore, setOnline } from '../test/fixtures';
import { OfflineBar } from './OfflineBar';

const MESSAGE = "You're offline — showing what you last loaded.";

afterEach(() => {
  // Unmount first: resetting the store under a mounted bar re-renders it outside act.
  cleanup();
  setOnline(true);
  resetAuthStore();
});

describe('OfflineBar', () => {
  it('shows while offline and signed in', () => {
    // Arrange
    setOnline(false);
    useAuthStore.getState().setSession(makeSession());

    // Act
    render(<OfflineBar />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(MESSAGE);
  });

  it('shows on an unconfirmed session, even if the browser says online', () => {
    // Arrange
    setOnline(true);
    useAuthStore.getState().setSession(makeSession(), { offline: true });

    // Act
    render(<OfflineBar />);

    // Assert
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  });

  it('shows nothing online', () => {
    // Arrange
    setOnline(true);
    useAuthStore.getState().setSession(makeSession());

    // Act
    render(<OfflineBar />);

    // Assert
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('shows nothing signed out', () => {
    // Arrange
    setOnline(false);
    useAuthStore.getState().clear();

    // Act
    render(<OfflineBar />);

    // Assert
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });
});
