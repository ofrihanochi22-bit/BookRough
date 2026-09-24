import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function Exploding(): never {
  throw new Error('render blew up');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error itself; silencing keeps the runner readable
    // without hiding a genuine failure, since the assertions below are on the DOM.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children when nothing throws', () => {
    // Arrange & Act
    render(
      <ErrorBoundary>
        <p>All fine</p>
      </ErrorBoundary>,
    );

    // Assert
    expect(screen.getByText('All fine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the fallback with a Reload button when a child throws', () => {
    // Arrange & Act
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );

    // Assert
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something broke on this page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('does not show the raw error message to the user', () => {
    // Arrange & Act
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );

    // Assert
    expect(screen.queryByText(/render blew up/)).not.toBeInTheDocument();
  });
});
