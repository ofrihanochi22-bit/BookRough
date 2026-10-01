import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('exposes a live status region so a loading state is announced', () => {
    // Arrange & Act
    render(<Spinner />);

    // Assert
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the caller-supplied label, which is the point on a slow scrape', () => {
    // Arrange & Act
    render(<Spinner label="Finding this track on other services…" />);

    // Assert
    expect(screen.getByText('Finding this track on other services…')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});
