import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetAuthStore, setDesign, setOnline } from '../../test/fixtures';
import { LoadError, NOT_LOADED_OFFLINE } from './LoadError';

afterEach(() => {
  setOnline(true);
  setDesign('current');
  resetAuthStore();
});

describe('LoadError', () => {
  it("online shows the screen's own message", () => {
    // Arrange
    setOnline(true);

    // Act
    render(<LoadError message="Couldn't load your list." onRetry={vi.fn()} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your list.");
  });

  it('offline says this was never loaded, with Try again', async () => {
    // Arrange
    setOnline(false);
    const onRetry = vi.fn();
    render(<LoadError message="Couldn't load your list." onRetry={onRetry} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_LOADED_OFFLINE);
    expect(onRetry).toHaveBeenCalled();
  });

  it('under Mixtape, offline still says this was never loaded', () => {
    // Arrange
    setOnline(false);
    setDesign('mixtape');

    // Act
    render(<LoadError message="Couldn't load your list." onRetry={vi.fn()} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_LOADED_OFFLINE);
  });
});
